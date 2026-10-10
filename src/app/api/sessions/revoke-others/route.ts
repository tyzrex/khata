import type { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";

/** Sign every other device out. The session making this request survives. */
export async function POST(request: NextRequest) {
  try {
    await requireUserId(request);
    await getAuth().api.revokeOtherSessions({ headers: request.headers });
    return Response.json({ status: true });
  } catch (error) {
    return jsonError(error);
  }
}