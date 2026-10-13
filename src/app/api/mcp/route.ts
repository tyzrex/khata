import { beginRequest } from "@/server/http";
import { requireAgentIdentity } from "@/server/session";
import { limits, trustedOrigins } from "@/server/request-guard";
import { isApiKey, readApiKey } from "@/server/agent/keys";
import { RateLimitError, UnauthorizedError } from "@/server/errors";
import { createMcpHandler } from "@/server/mcp/http";
import { mcpRuntime } from "@/server/mcp/runtime";

const handler = createMcpHandler({
  begin: beginRequest,
  authenticate: async (request) => {
    const key = readApiKey(request.headers);
    if (!key || !isApiKey(key)) throw new UnauthorizedError();
    const identity = await requireAgentIdentity(request);
    const budget = limits.mcpRequests.take(identity.apiKeyId!);
    if (!budget.ok) throw new RateLimitError("Too many MCP requests. Retry shortly.", budget.retryAfter);
    return identity;
  },
  origins: trustedOrigins,
  tools: mcpRuntime,
});
export const POST = handler;
export const GET = handler;
export const DELETE = handler;
