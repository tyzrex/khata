import type { NextRequest } from "next/server";
import { deleteGroup, updateGroup } from "@/db/shares";
import { badRequest, shareError } from "@/lib/http";
import { groupPatchSchema, shareIssue } from "@/lib/share-schemas";
import { requireUserId } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const parsed = groupPatchSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(shareIssue(parsed.error));
    await updateGroup(userId, id, parsed.data);
    return Response.json({ ok: true });
  } catch (error) {
    return shareError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    await deleteGroup(userId, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return shareError(error);
  }
}
