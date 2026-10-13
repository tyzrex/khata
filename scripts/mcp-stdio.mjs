import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// This bridge advertises the remote key's actual tools. It has no independent credentials or permissions.
const key = process.env.KHATA_API_KEY;
const endpoint = new URL("/api/mcp", process.env.KHATA_URL || "http://127.0.0.1:3847");
if (!key || !/^khata_[A-Za-z0-9_-]{43}$/.test(key))
  throw new Error("Set KHATA_API_KEY to a key created in Khata Settings.");
if (
  endpoint.protocol !== "https:" &&
  !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname))
)
  throw new Error("KHATA_URL must use HTTPS, or HTTP on localhost.");
const client = new Client({ name: "khata-stdio-bridge", version: "1.0.0" });
const server = new Server(
  { name: "khata", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, (request) => client.listTools(request.params));
server.setRequestHandler(CallToolRequestSchema, (request) =>
  client.callTool(request.params, undefined, { timeout: 60_000 }),
);
server.setRequestHandler(ListResourcesRequestSchema, (request) => client.listResources(request.params));
server.setRequestHandler(ReadResourceRequestSchema, (request) => client.readResource(request.params));
server.setRequestHandler(ListPromptsRequestSchema, (request) => client.listPrompts(request.params));
server.setRequestHandler(GetPromptRequestSchema, (request) => client.getPrompt(request.params));
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await Promise.allSettled([server.close(), client.close()]);
}
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
server.onclose = () => void close();
try {
  await client.connect(
    new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: { Authorization: `Bearer ${key}` } } }),
  );
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error("Khata MCP connection failed:", error instanceof Error ? error.message : "Unknown connection error");
  await close();
  process.exitCode = 1;
}
