import type { NextRequest } from "next/server";
import { deleteSharedExpense, describeSharedWrite, updateSharedExpense } from "@/db/shares";
import { badRequest, shareError, readJson } from "@/lib/http";
import { notifySharedWrite } from "@/lib/push-notifications";
import { expenseWriteSchema, shareIssue } from "@/lib/share-schemas";
import { requireUserId } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const parsed = expenseWriteSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(shareIssue(parsed.error));
    await updateSharedExpense(userId, id, parsed.data);
    const detail = await describeSharedWrite(userId, { kind: "expense", action: "updated", expenseId: id });
    if (detail) notifySharedWrite(detail);
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
    const detail = await describeSharedWrite(userId, { kind: "expense", action: "deleted", expenseId: id });
    if (detail) notifySharedWrite(detail);
    return new Response(null, { status: 204 });
  } catch (error) {
    return shareError(error);
  }
}
