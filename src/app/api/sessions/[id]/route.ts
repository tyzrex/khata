import type { NextRequest } from "next/server";
import { tokenForSessionId } from "@/db/profile";
import { getAuth } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

/**
 * Sign a session out by its public id. The token never reaches the browser, so the
 * id is resolved to a token here — scoped to the signed-in user, so a guessed id
 * cannot reach anyone else's session. better-auth treats revoking an unknown token
 * as success, which is the right answer here: the goal is "not signed in".
 */
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const token = await tokenForSessionId(userId, id);
    if (!token) return Response.json({ status: true });
    await getAuth().api.revokeSession({ body: { token }, headers: request.headers });
    return Response.json({ status: true });
  } catch (error) {
    return jsonError(error);
  }
}