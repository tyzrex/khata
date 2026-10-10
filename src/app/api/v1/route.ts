import { ENDPOINTS } from "@/lib/agent/openapi";

/** Public index: what this API is and where the full description lives. No data, so it can be prerendered. */
export async function GET() {
  return Response.json({
    ok: true,
    message: "Khata API v1. Personal NPR ledger and shared expenses for one user. Start with GET /api/v1/context.",
    data: {
      auth: "Authorization: Bearer khata_... (or X-API-Key). Create a key in Khata → Settings → API keys.",
      openapi: "/api/v1/openapi.json",
      guide: "/api/v1/llms.txt",
      envelope: "Success: { ok: true, message, data }. Failure: { ok: false, error, candidates? }.",
      endpoints: ENDPOINTS.map(([method, path, description]) => ({ method, path: `/api/v1${path}`, description })),
    },
  });
}
