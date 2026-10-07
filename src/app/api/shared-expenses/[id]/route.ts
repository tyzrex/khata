import type { NextRequest } from "next/server";
import { deleteSharedExpense, updateSharedExpense } from "@/db/shares";
import { badRequest, shareError } from "@/lib/http";
import { expenseWriteSchema, shareIssue } from "@/lib/share-schemas";
import { requireUserId } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const parsed = expenseWriteSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(shareIssue(parsed.error));
    await updateSharedExpense(userId, id, parsed.data);
    return Response.json({ id });
  } catch (error) {
    return shareError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    await deleteSharedExpense(userId, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return shareError(error);
  }
}
