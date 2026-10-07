import type { NextRequest } from "next/server";
import { getShareBook } from "@/db/shares";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    return Response.json(await getShareBook(userId));
  } catch (error) {
    return jsonError(error);
  }
}
