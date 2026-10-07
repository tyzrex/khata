import type { NextRequest } from "next/server";
import { summarizeLedger } from "@/db/ledger";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    return Response.json(await summarizeLedger(userId));
  } catch (error) {
    return jsonError(error);
  }
}
