import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMcpHandler } from "./http";
import { MCP_TOOLS } from "./catalog";
import type { McpRuntime } from "./server";
import type { AgentIdentity } from "@/lib/agent-permissions";
import { AgentInputError } from "@/server/agent/match";
import { ConflictError, RateLimitError, UnauthorizedError } from "@/server/errors";

function fixture() {
  const identities: Record<string, AgentIdentity> = {
    reader: { userId: "owner", viaApiKey: true, apiKeyId: "reader", agentName: "Reader", scopes: ["read"] },
    writer: { userId: "owner", viaApiKey: true, apiKeyId: "writer", agentName: "Writer", scopes: ["read", "write"] },
    second: { userId: "owner", viaApiKey: true, apiKeyId: "second", agentName: "Second", scopes: ["read", "write"] },
    other: {
      userId: "other",
      viaApiKey: true,
      apiKeyId: "other",
      agentName: "Other",
      scopes: ["read", "write", "delete"],
    },
  };
  const writes: { user: string; tool: string; args: Record<string, unknown> }[] = [];
  const audit: unknown[] = [];
  const stored = new Map<string, { payload: string; promise: Promise<{ data: unknown; message: string }> }>();
  const runtime: McpRuntime = {
    execute: async (tool, args, identity) => {
      if (args.merchant === "Ambiguous") throw new AgentInputError("Choose a person", ["Anita Rai", "Anita Lama"]);
      if (tool.startsWith("get_") || tool.startsWith("list_") || tool === "preview_expense")
        return { data: { owner: identity.userId, tool }, message: "Loaded" };
      writes.push({ user: identity.userId, tool, args });
      return { data: { id: `entry-${writes.length}` }, message: "Saved" };
    },
    once: async (identity, tool, requestId, args, run) => {
      const key = `${identity.apiKeyId}:${tool}:${requestId}`;
      const existing = stored.get(key);
      if (existing) {
        if (existing.payload !== JSON.stringify(args))
          throw new ConflictError("That requestId was used for different arguments.");
        return { result: await existing.promise, replayed: true };
      }
      const promise = run();
      stored.set(key, { payload: JSON.stringify(args), promise });
      return { result: await promise, replayed: false };
    },
    limit: () => {},
    beginOperation: async () => "operation",
    finishOperation: async (_id, result) => {
      audit.push(result);
    },
    expire: () => {},
  };
  const handler = createMcpHandler({
    begin: async () => {},
    origins: () => ["http://localhost:3847"],
    tools: runtime,
    authenticate: async (request) => {
      const token = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
      if (!identities[token]) throw new UnauthorizedError();
      return identities[token]!;
    },
  });
  async function client(token: string) {
    const client = new Client({ name: "test-agent", version: "1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL("http://localhost:3847/api/mcp"), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
        fetch: async (input, init) => handler(new Request(input, init)),
      }),
    );
    return client;
  }
  return { client, handler, identities, writes, audit, runtime };
}

const args = { merchant: "Lunch", amount: 120, requestId: "chat-message-1" };

test("SDK handshake, discovery and JSON schemas advertise the key's actual capabilities", async () => {
  const f = fixture();
  const reader = await f.client("reader");
  const writer = await f.client("writer");
  try {
    const readTools = (await reader.listTools()).tools;
    expect(readTools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
    expect(readTools.some((tool) => tool.name === "preview_expense")).toBe(true);
    expect(readTools.some((tool) => tool.name === "create_expense")).toBe(false);
    const writeTools = (await writer.listTools()).tools;
    expect(writeTools.some((tool) => tool.name === "create_expense")).toBe(true);
    expect(writeTools.some((tool) => tool.name === "delete_expense")).toBe(false);
    expect(writeTools.find((tool) => tool.name === "create_expense")?.inputSchema.required).toContain("requestId");
    expect(writeTools.find((tool) => tool.name === "create_expense")?.inputSchema.properties).toHaveProperty("items");
    expect((await reader.listResources()).resources.map((resource) => resource.uri)).toContain("khata://context");
    expect(
      (await reader.getPrompt({ name: "manage-khata", arguments: { task: "Split dinner" } })).messages[0]?.content,
    ).toHaveProperty("text");
  } finally {
    await Promise.all([reader.close(), writer.close()]);
  }
});

test("read-only callers cannot invoke hidden writes and arguments cannot impersonate another owner", async () => {
  const f = fixture();
  const reader = await f.client("reader");
  const writer = await f.client("writer");
  try {
    expect((await reader.callTool({ name: "create_transaction", arguments: args })).isError).toBe(true);
    expect((await writer.callTool({ name: "get_context", arguments: { userId: "other" } })).isError).toBe(true);
    expect(f.writes).toHaveLength(0);
    const context = await writer.callTool({ name: "get_context", arguments: {} });
    expect(context.structuredContent).toMatchObject({ ok: true, data: { owner: "owner" } });
  } finally {
    await Promise.all([reader.close(), writer.close()]);
  }
});

test("retries run once; changed arguments conflict; the same operation ID in another bot is independent", async () => {
  const f = fixture();
  const writer = await f.client("writer");
  const second = await f.client("second");
  try {
    const first = await writer.callTool({ name: "create_transaction", arguments: args });
    const retry = await writer.callTool({ name: "create_transaction", arguments: args });
    expect(first.structuredContent).toMatchObject({ ok: true, replayed: false });
    expect(retry.structuredContent).toMatchObject({ ok: true, replayed: true });
    expect(f.writes).toHaveLength(1);
    expect(
      (await writer.callTool({ name: "create_transaction", arguments: { ...args, amount: 121 } })).structuredContent,
    ).toMatchObject({ ok: false, status: 409 });
    await second.callTool({ name: "create_transaction", arguments: args });
    expect(f.writes).toHaveLength(2);
    expect(f.audit).toContainEqual({ status: "succeeded", replayed: true, targetId: "entry-1" });
  } finally {
    await Promise.all([writer.close(), second.close()]);
  }
});

test("revocation is checked again for the next request and two owners stay isolated", async () => {
  const f = fixture();
  const writer = await f.client("writer");
  const other = await f.client("other");
  try {
    expect((await other.callTool({ name: "get_context", arguments: {} })).structuredContent).toMatchObject({
      data: { owner: "other" },
    });
    delete f.identities.writer;
    await expect(writer.callTool({ name: "get_context", arguments: {} })).rejects.toThrow();
    expect(f.writes).toHaveLength(0);
  } finally {
    await Promise.all([writer.close(), other.close()]);
  }
});

test("GET and DELETE still check Origin and credentials, and stateless streams return 405", async () => {
  const f = fixture();
  for (const method of ["POST", "GET", "DELETE"]) {
    expect(
      (
        await f.handler(
          new Request("http://localhost:3847/api/mcp", {
            method,
            headers: { authorization: "Bearer reader", origin: "https://evil.example" },
          }),
        )
      ).status,
    ).toBe(403);
    expect((await f.handler(new Request("http://localhost:3847/api/mcp", { method }))).status).toBe(401);
  }
  expect(
    (await f.handler(new Request("http://localhost:3847/api/mcp", { headers: { authorization: "Bearer reader" } })))
      .status,
  ).toBe(405);
});

test("missing retry IDs, rate limits and ambiguous data report errors without writing", async () => {
  const f = fixture();
  const writer = await f.client("writer");
  try {
    expect(
      (await writer.callTool({ name: "create_transaction", arguments: { merchant: "Lunch", amount: 120 } })).isError,
    ).toBe(true);
    const ambiguous = await writer.callTool({
      name: "create_transaction",
      arguments: { ...args, merchant: "Ambiguous" },
    });
    expect(ambiguous.structuredContent).toMatchObject({ ok: false, candidates: ["Anita Rai", "Anita Lama"] });
    f.runtime.limit = () => {
      throw new RateLimitError("Wait", 30);
    };
    expect((await writer.callTool({ name: "create_transaction", arguments: args })).structuredContent).toMatchObject({
      ok: false,
      status: 429,
      retryAfter: 30,
    });
    expect(f.writes).toHaveLength(0);
  } finally {
    await writer.close();
  }
});

test("catalog has unique names and every mutation has a retry ID", () => {
  expect(new Set(MCP_TOOLS.map((tool) => tool.name)).size).toBe(MCP_TOOLS.length);
  expect(MCP_TOOLS.filter((tool) => tool.scope !== "read").every((tool) => "requestId" in tool.schema.shape)).toBe(
    true,
  );
});

test("the transport rejects malformed and oversized messages before executing a tool", async () => {
  const f = fixture();
  const headers = {
    authorization: "Bearer writer",
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  expect(
    (await f.handler(new Request("http://localhost:3847/api/mcp", { method: "POST", headers, body: "{broken" })))
      .status,
  ).toBe(400);
  expect(
    (
      await f.handler(
        new Request("http://localhost:3847/api/mcp", { method: "POST", headers, body: " ".repeat(1_000_001) }),
      )
    ).status,
  ).toBe(413);
  expect(f.writes).toHaveLength(0);
});
