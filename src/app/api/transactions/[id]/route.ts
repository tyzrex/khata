import type { NextRequest } from "next/server";
import { deleteTransaction, updateTransaction } from "@/db/ledger";
import { badRequest, jsonError, readJson } from "@/lib/http";
import { issueMessage, manualTransactionSchema } from "@/lib/schemas";
import { requireUserId } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const parsed = manualTransactionSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(issueMessage(parsed.error));
    const transaction = await updateTransaction(userId, id, parsed.data);
    if (!transaction) return Response.json({ error: "That entry is no longer in the ledger." }, { status: 404 });
    return Response.json({ transaction });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const removed = await deleteTransaction(userId, id);
    if (!removed) return Response.json({ error: "That entry is no longer in the ledger." }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
