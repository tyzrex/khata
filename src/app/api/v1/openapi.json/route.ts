import type { NextRequest } from "next/server";
import { openApiSpec } from "@/server/agent/openapi";
import { appOrigin } from "@/server/app-origin";

/** Public: tool importers fetch this without a key. It describes the API, not anyone's data. */
export async function GET(request: NextRequest) {
  return Response.json(openApiSpec(appOrigin(request)), { headers: { "access-control-allow-origin": "*" } });
}
