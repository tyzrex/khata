import type { NextRequest } from "next/server";
import { acceptInvite } from "@/db/invites";
import { shareError } from "@/lib/http";
import { requireUserId } from "@/lib/session";

type Context = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { token } = await context.params;
    const result = await acceptInvite(userId, token);
    return Response.json(result);
  } catch (error) {
    return shareError(error);
  }
}
