/** Run only against an explicitly selected disposable database. This never reads DATABASE_URL as a test target. */
import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq } from "drizzle-orm";
import { createMcpHandler } from "../src/server/mcp/http";
import { readApiKey } from "../src/server/agent/keys";

const testUrl = process.env.KHATA_TEST_DATABASE_URL;
if (!testUrl) {
  test.skip("MCP database integration: set KHATA_TEST_DATABASE_URL to a disposable Postgres", () => {});
} else {
  process.env.DATABASE_URL = testUrl;
  // Next cache invalidation and external delivery need a request context. Money, permissions,
  // receipts, key lookup, audits and idempotency all use the real repositories and real Postgres.
  mock.module("@/server/cache-tags", () => ({ expireSnapshot: () => {}, expireSnapshots: () => {} }));
  mock.module("@/server/push", () => ({ notifySharedWrite: () => {} }));
  const { getDb, getPool } = await import("../src/db/client");
  const schema = await import("../src/db/schema");
  const { createApiKey, identityForApiKey, revokeApiKey } = await import("../src/db/api-keys");
  const { mcpRuntime } = await import("../src/server/mcp/runtime");
  const { UnauthorizedError } = await import("../src/server/errors");
  const { purgeUserData } = await import("../src/db/purge-user");
  const { createPerson, getShareBook } = await import("../src/db/shares");
  const db = getDb();
  const users = [crypto.randomUUID(), crypto.randomUUID()];
  const clients: Client[] = [];
  let writer: Client, second: Client, reader: Client, other: Client;
  let readerKeyId: string, writerKeyId: string, writerToken: string;
  let expenseId: string;
  let selfId: string, anitaId: string, sameerId: string;
  const handler = createMcpHandler({
    begin: async () => {},
    origins: () => ["http://127.0.0.1:3847"],
    tools: mcpRuntime,
    authenticate: async (request) => {
      const token = readApiKey(request.headers);
      const identity = token ? await identityForApiKey(token) : null;
      if (!identity) throw new UnauthorizedError();
      return identity;
    },
  });
  async function connect(token: string) {
    const client = new Client({ name: "integration-agent", version: "1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL("http://127.0.0.1:3847/api/mcp"), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
        fetch: async (input, init) => handler(new Request(input, init)),
      }),
    );
    clients.push(client);
    return client;
  }
  async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
    const result = await client.callTool({ name, arguments: args });
    return {
      result,
      output: result.structuredContent as {
        ok: boolean;
        data: Record<string, unknown>;
        status?: number;
        replayed?: boolean;
      },
    };
  }
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
    await db
      .insert(schema.user)
      .values(
        users.map((id, index) => ({
          id,
          name: `MCP Test ${index}`,
          email: `mcp-${id}@example.test`,
          emailVerified: false,
        })),
      );
    const owner = users[0]!;
    const book = await getShareBook(owner);
    selfId = book.self.id;
    anitaId = (await createPerson(owner, "Anita")).id;
    sameerId = (await createPerson(owner, "Sameer")).id;
    const writerKey = await createApiKey(owner, "Writer", ["read", "write"]);
    const secondKey = await createApiKey(owner, "Second", ["read", "write"]);
    const readerKey = await createApiKey(owner, "Reader", ["read"]);
    const otherKey = await createApiKey(users[1]!, "Other", ["read", "write", "delete"]);
    writerKeyId = writerKey.key.id;
    writerToken = writerKey.token;
    readerKeyId = readerKey.key.id;
    [writer, second, reader, other] = await Promise.all([
      connect(writerKey.token),
      connect(secondKey.token),
      connect(readerKey.token),
      connect(otherKey.token),
    ]);
  }, 30_000);
  afterAll(async () => {
    await Promise.allSettled(clients.map((client) => client.close()));
    for (const id of users) {
      await purgeUserData(id);
      await db.delete(schema.user).where(eq(schema.user.id, id));
    }
    await getPool().end();
  });

  test("preview is read-only, receipt details persist, and retried writes are not duplicated", async () => {
    const receipt = {
      description: "Itemized dinner",
      items: [
        { description: "Food", amount: 300, splitWith: ["Anita", "Sameer"] },
        { description: "Drinks", amount: 200, split: [{ person: "Anita" }, { person: "Sameer" }] },
      ],
    };
    expect((await call(reader, "preview_expense", receipt)).output.ok).toBe(true);
    expect(
      (await db.select().from(schema.sharedExpenses).where(eq(schema.sharedExpenses.userId, users[0]!))).length,
    ).toBe(0);
    const first = (await call(writer, "create_expense", { ...receipt, requestId: "receipt-1" })).output;
    expect(first.ok).toBe(true);
    expenseId = String(first.data.id);
    expect((await call(writer, "create_expense", { ...receipt, requestId: "receipt-1" })).output.replayed).toBe(true);
    expect(
      (await db.select().from(schema.sharedExpenses).where(eq(schema.sharedExpenses.userId, users[0]!))).length,
    ).toBe(1);
    const saved = (await call(writer, "get_expense", { id: expenseId })).output.data.expense as {
      items: unknown[];
      shares: { personId: string; amount: number }[];
      version: number;
    };
    expect(saved.items).toHaveLength(2);
    expect(saved.version).toBe(1);
    expect(Object.fromEntries(saved.shares.map((share) => [share.personId, share.amount]))).toEqual({
      [selfId]: 100,
      [anitaId]: 200,
      [sameerId]: 200,
    });
    const audit = await db
      .select()
      .from(schema.agentOperations)
      .where(eq(schema.agentOperations.apiKeyId, writerKeyId));
    expect(audit).toHaveLength(2);
    expect(audit.some((entry) => entry.replayed)).toBe(true);
  });

  test("updates preserve receipt details, record revisions, reject stale versions and refuse inconsistent totals", async () => {
    const update = {
      id: expenseId,
      version: 1,
      description: "Dinner corrected",
      amount: 500,
      splitMode: "exact",
      split: [
        { person: "me", value: 100 },
        { person: "Anita", value: 200 },
        { person: "Sameer", value: 200 },
      ],
      requestId: "edit-1",
    };
    const changed = (await call(writer, "update_expense", update)).output;
    expect(changed.ok).toBe(true);
    const current = changed.data.expense as { version: number; items: unknown[] };
    expect(current.version).toBe(2);
    expect(current.items).toHaveLength(2);
    expect(
      (
        await db
          .select()
          .from(schema.sharedExpenseRevisions)
          .where(eq(schema.sharedExpenseRevisions.expenseId, expenseId))
      )[0]?.snapshot.items,
    ).toHaveLength(2);
    expect((await call(writer, "update_expense", { ...update, requestId: "stale" })).output.status).toBe(409);
    expect(
      (
        await call(writer, "update_expense", {
          ...update,
          version: 2,
          amount: 501,
          split: [
            { person: "me", value: 101 },
            { person: "Anita", value: 200 },
            { person: "Sameer", value: 200 },
          ],
          requestId: "bad-receipt",
        })
      ).output.status,
    ).toBe(400);
  });

  test("bot retry IDs are isolated, one owner's private entries stay private, and foreign expense writes fail", async () => {
    expect((await call(writer, "create_account", { name: "Cash", requestId: "create-cash" })).output.ok).toBe(true);
    const entry = { merchant: "Test lunch", amount: 120, account: "Cash", requestId: "same-id" };
    expect((await call(writer, "create_transaction", entry)).output).toMatchObject({ ok: true });
    expect((await call(second, "create_transaction", entry)).output.ok).toBe(true);
    const own = (await call(writer, "list_transactions", {})).output.data.transactions as unknown[];
    const foreign = (await call(other, "list_transactions", {})).output.data.transactions as unknown[];
    expect(own).toHaveLength(2);
    expect(foreign).toHaveLength(0);
    expect((await call(other, "get_expense", { id: expenseId })).output.status).toBe(404);
    expect((await call(other, "delete_expense", { id: expenseId, requestId: "foreign-delete" })).output.status).toBe(
      404,
    );
    expect((await reader.callTool({ name: "create_transaction", arguments: entry })).isError).toBe(true);
  });

  test("the shipped stdio bridge forwards real MCP tools and resources over HTTP", async () => {
    const http = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
    const bridge = new Client({ name: "stdio-integration-agent", version: "1" });
    try {
      await bridge.connect(
        new StdioClientTransport({
          command: "node",
          args: ["scripts/mcp-stdio.mjs"],
          cwd: process.cwd(),
          env: { PATH: process.env.PATH ?? "", KHATA_URL: `http://127.0.0.1:${http.port}`, KHATA_API_KEY: writerToken },
          stderr: "pipe",
        }),
      );
      const tools = (await bridge.listTools()).tools;
      expect(tools.some((tool) => tool.name === "preview_expense")).toBe(true);
      expect(tools.some((tool) => tool.name === "delete_expense")).toBe(false);
      const context = await bridge.callTool({ name: "get_context", arguments: {} });
      expect(context.structuredContent).toMatchObject({ ok: true, data: { agent: { name: "Writer" } } });
      expect((await bridge.readResource({ uri: "khata://permissions" })).contents).toHaveLength(1);
    } finally {
      await bridge.close();
      http.stop(true);
    }
  }, 15_000);

  test("expiry and revocation invalidate credentials and agent history is scoped to the calling bot", async () => {
    const history = (await call(reader, "list_agent_activity", {})).output.data.operations as unknown[];
    expect(history).toHaveLength(0);
    await db
      .update(schema.apiKeys)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.apiKeys.id, readerKeyId));
    await expect(reader.callTool({ name: "get_context", arguments: {} })).rejects.toThrow();
    await revokeApiKey(users[0]!, writerKeyId);
    expect(await identityForApiKey(writerToken)).toBeNull();
    expect(
      (
        await db
          .select()
          .from(schema.agentOperations)
          .where(and(eq(schema.agentOperations.apiKeyId, writerKeyId), eq(schema.agentOperations.status, "failed")))
      ).length,
    ).toBeGreaterThan(0);
  });
}
