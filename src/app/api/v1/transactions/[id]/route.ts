import type { NextRequest } from "next/server";
import { getTransaction } from "@/db/agent";
import { deleteTransaction, listCategories, updateTransaction } from "@/db/ledger";
import { listAccountNames } from "@/db/accounts";
import { resolveAccount, resolveCategory } from "@/lib/agent/match";
import { agentError, fail, ok, spendWrite, zodMessage } from "@/lib/agent/respond";
import { transactionPatch } from "@/lib/agent/schemas";
import { transactionSentence } from "@/lib/agent/views";
import { readJson } from "@/lib/http";
import { todayInKathmandu } from "@/lib/period";
import { manualTransactionSchema } from "@/lib/schemas";
import { requireAgentUserId } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

const MISSING = "No transaction with that id. List them with GET /api/v1/transactions.";

export async function GET(request: NextRequest, context: Context) {
  try {
    const userId = await requireAgentUserId(request);
    const { id } = await context.params;
    const row = await getTransaction(userId, id);
    if (!row) return fail(MISSING, 404);
    return ok({ transaction: row }, `${transactionSentence(row)}.`);
  } catch (error) {
    return agentError(error);
  }
}

/** Change only the fields sent; the rest keep their current values. */
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const userId = await requireAgentUserId(request);
    const limited = spendWrite(userId);
    if (limited) return limited;
    const { id } = await context.params;
    const parsed = transactionPatch(todayInKathmandu()).safeParse(await readJson(request));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const current = await getTransaction(userId, id);
    if (!current) return fail(MISSING, 404);
    const patch = parsed.data;
    const type = patch.type ?? current.type;
    const categoryNames = (await listCategories(userId)).map((category) => category.name);
    const accountNames = await listAccountNames(userId);
    const merged = manualTransactionSchema.safeParse({
      date: patch.date ?? current.date,
      type,
      amount: patch.amount ?? current.amount,
      currency: "NPR",
      category: patch.category ? resolveCategory(patch.category, type, categoryNames) : current.category,
      merchant: patch.merchant ?? patch.description ?? current.merchant,
      account: patch.account ? resolveAccount(patch.account, accountNames) : current.account,
      note: patch.note ?? current.note,
    });
    if (!merged.success) return fail(zodMessage(merged.error));
    const row = await updateTransaction(userId, id, merged.data);
    if (!row) return fail(MISSING, 404);
    return ok({ transaction: row }, `Updated: ${transactionSentence(row)}.`);
  } catch (error) {
    return agentError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const userId = await requireAgentUserId(request);
    const limited = spendWrite(userId);
    if (limited) return limited;
    const { id } = await context.params;
    const current = await getTransaction(userId, id);
    if (!current || !(await deleteTransaction(userId, id))) return fail(MISSING, 404);
    return ok({ id }, `Deleted: ${transactionSentence(current)}.`);
  } catch (error) {
    return agentError(error);
  }
}
