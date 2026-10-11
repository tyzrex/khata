import type { NextRequest } from "next/server";
import { deleteSharedExpense, describeSharedWrite, getShareBook } from "@/db/shares";
import { agentError, fail, ok, spendWrite } from "@/lib/agent/respond";
import { expenseViews } from "@/lib/agent/views";
import { notifySharedWrite } from "@/lib/push-notifications";
import { requireAgentUserId } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

const MISSING = "No shared expense with that id. List them with GET /api/v1/expenses.";

export async function GET(request: NextRequest, context: Context) {
  try {
    const userId = await requireAgentUserId(request);
    const { id } = await context.params;
    const expense = expenseViews(await getShareBook(userId)).find((entry) => entry.id === id);
    if (!expense) return fail(MISSING, 404);
    return ok({ expense }, `${expense.summary}.`);
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
    const expense = expenseViews(await getShareBook(userId)).find((entry) => entry.id === id);
    if (!expense) return fail(MISSING, 404);
    await deleteSharedExpense(userId, id);
    const detail = await describeSharedWrite(userId, { kind: "expense", action: "deleted", expenseId: id });
    if (detail) notifySharedWrite(detail);
    return ok({ id }, `Deleted "${expense.description}" (${expense.date}). Balances are updated.`);
  } catch (error) {
    return agentError(error);
  }
}
