import type { NextRequest } from "next/server";
import { getInviteByToken } from "@/db/invites";
import { jsonError, beginRequest } from "@/lib/http";

type Context = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, context: Context) {
  try {
    await beginRequest();
    const { token } = await context.params;
    const info = await getInviteByToken(token);
    if (!info) return Response.json({ error: "This invite link is not valid." }, { status: 404 });
    return Response.json(info);
  } catch (error) {
    return jsonError(error);
  }
}
