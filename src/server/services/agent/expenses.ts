import { accountOf } from "@/db/agent";
import { ensureDirectGroup, findSharedExpense, getShareBook } from "@/db/shares";
import { normalizeName } from "@/server/agent/match";
import { describeSplits, findGroup, planExpense, whereText } from "@/server/agent/plan";
import { expenseInput, type expenseQuery } from "@/server/agent/schemas";
import { expenseView, expenseViews, type ExpenseView } from "@/server/agent/views";
import { formatNpr } from "@/lib/format";
import { NotFoundError } from "@/server/errors";
import { addSharedExpense, removeSharedExpense } from "@/server/services/shared-writes";
import type { Rendered } from "@/server/services/agent/balances";
import type { z } from "zod";

/**
 * Shared expenses, addressed by name.
 *
 * The bot says "the 800 biryani I split with Anita" and this resolves it into
 * ids: `planExpense` picks the book, the people, and the split, and only then
 * does anything touch the database. See `lib/agent/openapi.ts` for how
 * `splitWith`, `excludeMe` and `split` combine.
 */

const MISSING = "No shared expense with that id. List them with GET /api/v1/expenses.";

export type ExpenseQuery = z.infer<typeof expenseQuery>;
export type ExpenseDraft = z.infer<ReturnType<typeof expenseInput>>;

export async function listExpenses(userId: string, query: ExpenseQuery): Promise<Rendered<unknown>> {
  const { group, with: withName, category, from, to, limit } = query;
  const book = await getShareBook(userId);
  const groupId = group ? findGroup(book, group).groupId : null;
  const wanted = withName ? normalizeName(withName) : "";
  const matches = expenseViews(book).filter((expense) => matchesQuery(expense, { groupId, category, from, to, wanted }));
  const rows = matches.slice(0, limit);
  const round = (total: number) => Math.round(total * 100) / 100;
  const total = round(matches.reduce((sum, expense) => sum + expense.amount, 0));
  const yourShare = round(matches.reduce((sum, expense) => sum + expense.yourShare, 0));
  return {
    data: { expenses: rows, totals: { count: matches.length, total, yourShare }, truncated: rows.length < matches.length },
    message: matches.length
      ? `${matches.length} shared ${matches.length === 1 ? "expense" : "expenses"} totalling ${formatNpr(total)}; your share ${formatNpr(yourShare)}.`
      : "No shared expenses match.",
  };
}

/**
 * "with" matches a whole name or any single word of it, so `with: "Anita Rai"`
 * and `with: "rai"` both find her.
 */
function matchesQuery(expense: ExpenseView, filter: { groupId: string | null; category?: string; from?: string; to?: string; wanted: string }) {
  if (filter.groupId && expense.groupId !== filter.groupId) return false;
  if (filter.category && (expense.category ?? "") !== filter.category) return false;
  if (filter.from && expense.date < filter.from) return false;
  if (filter.to && expense.date > filter.to) return false;
  if (!filter.wanted) return true;
  return expense.shares.some((share) => {
    const name = normalizeName(share.name);
    return name.includes(filter.wanted) || name.split(" ").includes(filter.wanted);
  });
}

export async function readExpense(userId: string, expenseId: string): Promise<Rendered<{ expense: ExpenseView }>> {
  const found = await findSharedExpense(userId, expenseId);
  if (!found) throw new NotFoundError(MISSING);
  const expense = expenseView(found.expense, found.selfId);
  return { data: { expense }, message: `${expense.summary}.` };
}

export async function deleteExpense(userId: string, expenseId: string, viaApiKey: boolean): Promise<Rendered<{ id: string }>> {
  // Snapshot before the row goes, so the reply can name what was removed.
  const found = await findSharedExpense(userId, expenseId);
  if (!found) throw new NotFoundError(MISSING);
  const expense = expenseView(found.expense, found.selfId);
  await removeSharedExpense(userId, expenseId, { includeActor: viaApiKey });
  return { data: { id: expenseId }, message: `Deleted "${expense.description}" (${expense.date}). Balances are updated.` };
}

export async function addExpense(userId: string, draft: ExpenseDraft, viaApiKey: boolean): Promise<Rendered<unknown>> {
  const [book, account] = await Promise.all([getShareBook(userId), accountOf(userId)]);
  const plan = planExpense(book, draft, { accountName: account.name });
  const groupId = plan.directWith ? await ensureDirectGroup(userId, plan.directWith) : plan.write.groupId;
  const id = await addSharedExpense(userId, { ...plan.write, groupId }, { includeActor: viaApiKey });

  const memberName = (personId: string) => (personId === plan.scope.selfId ? "You" : (plan.scope.members.find((member) => member.id === personId)?.name ?? "Someone"));
  const where = plan.directWith
    ? `with ${plan.scope.members.find((member) => member.id === plan.directWith)?.name}`
    : plan.scope.kind === "outside"
      ? "outside any group"
      : `in ${whereText(plan.scope)}`;
  const payer = memberName(plan.write.paidById);
  return {
    data: {
      id,
      groupId,
      description: plan.write.description,
      amount: plan.write.amount,
      date: plan.write.date,
      paidBy: payer,
      splitMode: plan.write.splitMode,
      shares: plan.splits.map((share) => ({ personId: share.personId, name: memberName(share.personId), amount: share.amount })),
    },
    message: `Added "${plan.write.description}" ${formatNpr(plan.write.amount)} ${where}, paid by ${payer}. ${describeSplits(plan.scope, plan.write.splitMode, plan.splits)}`,
    status: 201,
  };
}
