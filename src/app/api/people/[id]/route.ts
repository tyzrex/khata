import type { NextRequest } from "next/server";
import { deletePerson, renamePerson } from "@/db/shares";
import { badRequest, shareError, readJson } from "@/lib/http";
import { personWriteSchema, shareIssue } from "@/lib/share-schemas";
import { requireUserId } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const parsed = personWriteSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(shareIssue(parsed.error));
    const person = await renamePerson(userId, id, parsed.data.name);
    return Response.json({ person });
  } catch (error) {
    return shareError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    await deletePerson(userId, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return shareError(error);
  }
}
