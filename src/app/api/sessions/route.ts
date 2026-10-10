import type { NextRequest } from "next/server";
import { listUserSessions } from "@/db/profile";
import { beginRequest, jsonError } from "@/lib/http";
import { getAuth } from "@/lib/auth";
import { requireUserId } from "@/lib/session";

/**
 * Signed-in sessions for the account settings screen. This route reads the table
 * itself (see db/profile.ts for why) and does not go through better-auth's
 * /list-sessions, which refuses to answer once a session is older than
 * `session.freshAge`.
 */
export async function GET(request: NextRequest) {
  try {
    await beginRequest();
    const userId = await requireUserId(request);
    const current = await getAuth().api.getSession({ headers: request.headers });
    const sessions = await listUserSessions(userId, current?.session.token ?? null);
    return Response.json({ sessions });
  } catch (error) {
    return jsonError(error);
  }
}