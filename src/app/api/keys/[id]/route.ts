import type { NextRequest } from "next/server";
import { revokeApiKey } from "@/db/api-keys";
import { shareError } from "@/lib/http";
import { requireUserId } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

/** Revokes a key at once. Bots using it get 401 on their next call. */
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    if (!(await revokeApiKey(userId, id))) return Response.json({ error: "That key is not active." }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    return shareError(error);
  }
}
