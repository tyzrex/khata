import type { NextRequest } from "next/server";
import { deleteSharedExpense, updateSharedExpense } from "@/db/shares";
import { badRequest, beginRequest, shareError } from "@/lib/http";
import { expenseWriteSchema, shareIssue } from "@/lib/share-schemas";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  await beginRequest();
  try {
    const { id } = await context.params;
    const parsed = expenseWriteSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(shareIssue(parsed.error));
    await updateSharedExpense(id, parsed.data);
    return Response.json({ id });
  } catch (error) {
    return shareError(error);
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  await beginRequest();
  try {
    const { id } = await context.params;
    await deleteSharedExpense(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return shareError(error);
  }
}
