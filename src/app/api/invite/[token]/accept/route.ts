import type { NextRequest } from "next/server";
import { acceptInvite } from "@/db/invites";
import { shareError, tooManyRequests } from "@/lib/http";
import { clientIp, isInviteToken, limits } from "@/lib/request-guard";
import { requireUserId } from "@/lib/session";

type Context = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const limit = limits.inviteLookups.take(clientIp(request.headers));
    if (!limit.ok) return tooManyRequests(limit.retryAfter);
    const { token } = await context.params;
    if (!isInviteToken(token)) return Response.json({ error: "This invite link is not valid." }, { status: 404 });
    const result = await acceptInvite(userId, token);
    return Response.json(result);
  } catch (error) {
    return shareError(error);
  }
}
