import type { NextRequest } from "next/server";
import { deletePerson, renamePerson } from "@/db/shares";
import { badRequest, beginRequest, shareError } from "@/lib/http";
import { personWriteSchema, shareIssue } from "@/lib/share-schemas";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  await beginRequest();
  try {
    const { id } = await context.params;
    const parsed = personWriteSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(shareIssue(parsed.error));
    const person = await renamePerson(id, parsed.data.name);
    return Response.json({ person });
  } catch (error) {
    return shareError(error);
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  await beginRequest();
  try {
    const { id } = await context.params;
    await deletePerson(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return shareError(error);
  }
}
