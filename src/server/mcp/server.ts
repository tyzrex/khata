import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentIdentity } from "@/lib/agent-permissions";
import { canAgent } from "@/lib/agent-permissions";
import { toFailure, ForbiddenError, ValidationError } from "@/server/errors";
import { MCP_GUIDE, MCP_TOOLS } from "@/server/mcp/catalog";

type ToolView = { data: unknown; message: string };
export type McpRuntime = {
  execute(
    tool: string,
    args: Record<string, unknown>,
    identity: AgentIdentity,
    requestId?: string,
  ): Promise<ToolView>;
  once(
    identity: AgentIdentity,
    tool: string,
    requestId: string,
    args: Record<string, unknown>,
    run: () => Promise<ToolView>,
  ): Promise<{ result: ToolView; replayed: boolean }>;
  limit(identity: AgentIdentity): void;
  beginOperation(identity: AgentIdentity, tool: string): Promise<string>;
  finishOperation(
    id: string,
    outcome: {
      status: "succeeded" | "failed";
      replayed?: boolean;
      targetId?: string | null;
      errorStatus?: number;
    },
  ): Promise<void>;
  expire(userId: string): void;
};

function targetId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const object = data as Record<string, unknown>;
  if (typeof object.id === "string") return object.id;
  for (const key of [
    "expense",
    "transaction",
    "group",
    "account",
    "category",
    "settlement",
  ]) {
    const nested = object[key] as { id?: unknown } | undefined;
    if (typeof nested?.id === "string") return nested.id;
  }
  const transactions = object.transactions;
  if (
    Array.isArray(transactions) &&
    transactions.length === 1 &&
    typeof transactions[0]?.id === "string"
  )
    return transactions[0].id;
  return null;
}

/** One server per HTTP request. Identity never lives in a global or client-supplied argument. */
export function createKhataMcpServer(
  identity: AgentIdentity,
  runtime: McpRuntime,
) {
  const server = new McpServer(
    { name: "khata", version: "1.0.0" },
    { instructions: MCP_GUIDE, maxToolInputElements: 10_000 },
  );
  for (const tool of MCP_TOOLS) {
    if (!canAgent(identity, tool.scope)) continue;
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
        annotations: {
          readOnlyHint: tool.scope === "read",
          destructiveHint: tool.destructive,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (input: unknown) => {
        let operation: string | null = null;
        try {
          if (!canAgent(identity, tool.scope))
            throw new ForbiddenError(
              `This agent does not have ${tool.scope} access.`,
            );
          const args = input as Record<string, unknown>;
          let view: ToolView;
          let replayed = false;
          if (tool.scope === "read")
            view = await runtime.execute(tool.name, args, identity);
          else {
            runtime.limit(identity);
            operation = await runtime.beginOperation(identity, tool.name);
            const { requestId, ...payload } = args;
            const run = await runtime.once(
              identity,
              tool.name,
              String(requestId),
              payload,
              () =>
                runtime.execute(
                  tool.name,
                  payload,
                  identity,
                  String(requestId),
                ),
            );
            view = run.result;
            replayed = run.replayed;
            // The mutation already landed; cache/audit failures must not tell a bot to repeat it.
            try {
              runtime.expire(identity.userId);
            } catch (error) {
              console.error("MCP cache invalidation failed", error);
            }
            await runtime
              .finishOperation(operation, {
                status: "succeeded",
                replayed,
                targetId: targetId(view.data),
              })
              .catch((error) =>
                console.error("MCP audit completion failed", error),
              );
          }
          const output = {
            ok: true,
            message: view.message,
            data: view.data,
            ...(tool.scope !== "read" ? { replayed } : {}),
          };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        } catch (caught) {
          const error =
            caught instanceof z.ZodError
              ? new ValidationError(
                  caught.issues[0]?.message ?? "Invalid arguments",
                  caught.issues,
                )
              : caught;
          const failure = toFailure(error, "agent");
          if (operation)
            await runtime
              .finishOperation(operation, {
                status: "failed",
                errorStatus: failure.status,
              })
              .catch((error) =>
                console.error("MCP audit completion failed", error),
              );
          if (failure.status >= 500) console.error("MCP tool failed", error);
          const output = { ok: false, ...failure };
          return {
            isError: true,
            content: [{ type: "text" as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        }
      },
    );
  }
  server.registerResource(
    "guide",
    "khata://guide",
    { title: "Khata agent workflow", mimeType: "text/markdown" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: MCP_GUIDE }],
    }),
  );
  server.registerResource(
    "permissions",
    "khata://permissions",
    { title: "This bot's permissions", mimeType: "application/json" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({
            name: identity.agentName,
            keyId: identity.apiKeyId,
            scopes: identity.scopes,
          }),
        },
      ],
    }),
  );
  if (canAgent(identity, "read"))
    server.registerResource(
      "context",
      "khata://context",
      { title: "Current Khata context", mimeType: "application/json" },
      async (uri) => {
        const view = await runtime.execute("get_context", {}, identity);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(view.data),
            },
          ],
        };
      },
    );
  server.registerPrompt(
    "manage-khata",
    {
      title: "Manage Khata",
      description:
        "Apply the delegated task using current context, precise splits, permissions and stable retry IDs.",
      argsSchema: { task: z.string().max(4000) },
    },
    ({ task }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `${MCP_GUIDE}\nDelegated task:\n${task}`,
          },
        },
      ],
    }),
  );
  return server;
}
