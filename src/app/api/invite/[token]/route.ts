import type { NextRequest } from "next/server";
import { getInviteByToken } from "@/db/invites";
import { beginRequest, jsonError, tooManyRequests } from "@/lib/http";
import { clientIp, isInviteToken, limits } from "@/lib/request-guard";

type Context = { params: Promise<{ token: string }> };

const INVALID = { error: "This invite link is not valid." };

/** Public: anyone holding the link can see who it is from. Malformed tokens never reach the database. */
export async function GET(request: NextRequest, context: Context) {
  try {
    await beginRequest();
    const limit = limits.inviteLookups.take(clientIp(request.headers));
    if (!limit.ok) return tooManyRequests(limit.retryAfter);
    const { token } = await context.params;
    if (!isInviteToken(token)) return Response.json(INVALID, { status: 404 });
    const info = await getInviteByToken(token);
    if (!info) return Response.json(INVALID, { status: 404 });
    return Response.json(info, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
