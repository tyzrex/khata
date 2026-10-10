import type { NextRequest } from "next/server";
import { readAccountFlags } from "@/lib/session";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    return Response.json(await readAccountFlags(userId));
  } catch (error) {
    return jsonError(error);
  }
}