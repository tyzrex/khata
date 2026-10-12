import type { NextRequest } from "next/server";
import { llmsText } from "@/server/agent/llms";
import { appOrigin } from "@/server/app-origin";

/** Public: a plain-text guide for language models. */
export async function GET(request: NextRequest) {
  return new Response(llmsText(appOrigin(request)), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
