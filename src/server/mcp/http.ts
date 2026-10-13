import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createKhataMcpServer, type McpRuntime } from "@/server/mcp/server";
import type { AgentIdentity } from "@/lib/agent-permissions";
import { toFailure, ForbiddenError, UnauthorizedError } from "@/server/errors";

export type McpHttpRuntime = {
  begin(): Promise<void>;
  authenticate(request: Request): Promise<AgentIdentity>;
  origins(): string[];
  tools: McpRuntime;
};

/** Authentication and Origin validation apply to every method, including GET and DELETE. */
export function createMcpHandler(runtime: McpHttpRuntime) {
  return async (request: Request) => {
    await runtime.begin();
    try {
      const origin = request.headers.get("origin");
      if (origin && !runtime.origins().includes(origin))
        throw new ForbiddenError("This origin is not allowed to access Khata MCP.");
      const identity = await runtime.authenticate(request);
      if (!identity.viaApiKey || !identity.apiKeyId) throw new UnauthorizedError();
      if (request.method !== "POST")
        return new Response(null, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
      const server = createKhataMcpServer(identity, runtime.tools);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        maxRequestBodySize: 1_000_000,
      });
      try {
        await server.connect(transport);
        const response = await transport.handleRequest(request);
        response.headers.set("cache-control", "no-store");
        return response;
      } finally {
        await server.close();
      }
    } catch (error) {
      const failure = toFailure(error, "agent");
      return Response.json(
        { ok: false, ...failure },
        {
          status: failure.status,
          headers: {
            "cache-control": "no-store",
            ...(failure.status === 401 ? { "www-authenticate": 'Bearer realm="Khata MCP"' } : {}),
            ...(failure.retryAfter ? { "retry-after": String(failure.retryAfter) } : {}),
          },
        },
      );
    }
  };
}
