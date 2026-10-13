import { roundMoney } from "@/lib/money";
import { accountOf } from "@/db/agent";
import { ensureDirectGroup, findSharedExpense, getShareBook } from "@/db/shares";
import { normalizeName } from "@/server/agent/match";
import { describeSplits, findGroup, planExpense, whereText } from "@/server/agent/plan";
import { expenseInput, type expenseQuery } from "@/server/agent/schemas";
import { expenseView, expenseViews, type ExpenseView } from "@/server/agent/views";
import { formatNpr } from "@/lib/format";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { addSharedExpense, editSharedExpense, removeSharedExpense } from "@/server/services/shared-writes";
import { todayInKathmandu } from "@/lib/period";
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
  const round = roundMoney;
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
      version: 1,
      items: (plan.write.items ?? []).map((item) => ({ description: item.description, amount: item.amount, splitMode: item.splitMode, shares: item.splits.map((share) => ({ ...share, name: memberName(share.personId) })) })),
      shares: plan.splits.map((share) => ({ personId: share.personId, name: memberName(share.personId), amount: share.amount })),
    },
    message: `Added "${plan.write.description}" ${formatNpr(plan.write.amount)} ${where}, paid by ${payer}. ${describeSplits(plan.scope, plan.write.splitMode, plan.splits)}`,
    status: 201,
  };
}

/** Resolves names and computes every share without creating a friend, group, or expense. */
export async function previewExpense(userId: string, draft: ExpenseDraft): Promise<Rendered<unknown>> {
  const [book, account] = await Promise.all([getShareBook(userId), accountOf(userId)]);
  const plan = planExpense(book, draft, { accountName: account.name });
  const name = (id: string) => id === plan.scope.selfId ? "You" : plan.scope.members.find((person) => person.id === id)?.name ?? "Someone";
  return { data: { preview: true, groupId: plan.scope.groupId, amount: plan.write.amount, paidBy: name(plan.write.paidById), splitMode: plan.write.splitMode, shares: plan.splits.map((share) => ({ ...share, name: name(share.personId) })), items: (plan.write.items ?? []).map((item) => ({ description: item.description, amount: item.amount, splitMode: item.splitMode, shares: item.splits.map((share) => ({ ...share, name: name(share.personId) })) })) }, message: describeSplits(plan.scope, plan.write.splitMode, plan.splits) };
}

/** Full split replacement, guarded by the version the agent read. */
export async function editExpense(userId: string, id: string, payload: Record<string, unknown>, viaApiKey: boolean): Promise<Rendered<unknown>> {
  const found = await findSharedExpense(userId, id);
  if (!found) throw new NotFoundError(MISSING);
  const version = payload.version;
  if (payload.clearItems === true && payload.items !== undefined) throw new ValidationError("Choose updated receipt items or clearItems, not both.");
  if (!Number.isInteger(version) || Number(version) <= 0) throw new ValidationError("Read the expense first and supply its current version.");
  if (version !== found.expense.version) throw new ConflictError("This shared expense changed. Read it again before updating.");
  const parsed = expenseInput(todayInKathmandu()).safeParse({ ...payload, date: payload.date ?? found.expense.date, paidBy: payload.paidBy ?? found.expense.paidById, note: payload.note ?? found.expense.note, category: payload.category === undefined ? found.expense.category ?? undefined : payload.category, group: payload.group === undefined ? found.expense.groupId : payload.group });
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid expense");
  const [book, account] = await Promise.all([getShareBook(userId), accountOf(userId)]);
  const plan = planExpense(book, parsed.data, { accountName: account.name });
  const groupId = plan.directWith ? await ensureDirectGroup(userId, plan.directWith) : plan.write.groupId;
  await editSharedExpense(userId, id, { ...plan.write, groupId, version: Number(version), items: payload.clearItems === true ? null : plan.write.items }, { includeActor: viaApiKey });
  return readExpense(userId, id);
}
