import type { NextRequest } from "next/server";
import { llmsText } from "@/lib/agent/llms";
import { appOrigin } from "@/lib/app-origin";

/** Public: a plain-text guide for language models. */
export async function GET(request: NextRequest) {
  return new Response(llmsText(appOrigin(request)), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
