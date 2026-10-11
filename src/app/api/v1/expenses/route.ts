import type { NextRequest } from "next/server";
import { accountOf } from "@/db/agent";
import { createSharedExpense, describeSharedWrite, ensureDirectGroup, getShareBook } from "@/db/shares";
import { normalizeName } from "@/lib/agent/match";
import { describeSplits, findGroup, planExpense, whereText } from "@/lib/agent/plan";
import { agentError, fail, ok, spendWrite, zodMessage } from "@/lib/agent/respond";
import { expenseInput, expenseQuery } from "@/lib/agent/schemas";
import { expenseViews } from "@/lib/agent/views";
import { formatNpr } from "@/lib/format";
import { readJson } from "@/lib/http";
import { todayInKathmandu } from "@/lib/period";
import { notifySharedWrite } from "@/lib/push-notifications";
import { requireAgentIdentity, requireAgentUserId } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAgentUserId(request);
    const parsed = expenseQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const { group, with: withName, category, from, to, limit } = parsed.data;
    const book = await getShareBook(userId);
    const groupId = group ? findGroup(book, group).groupId : null;
    const wanted = withName ? normalizeName(withName) : "";
    const matches = expenseViews(book).filter(
      (expense) =>
        (!groupId || expense.groupId === groupId) &&
        (!category || (expense.category ?? "") === category) &&
        (!from || expense.date >= from) &&
        (!to || expense.date <= to) &&
        (!wanted || expense.shares.some((share) => normalizeName(share.name).split(" ").concat(normalizeName(share.name)).includes(wanted))),
    );
    const rows = matches.slice(0, limit);
    const total = Math.round(matches.reduce((sum, expense) => sum + expense.amount, 0) * 100) / 100;
    const yourShare = Math.round(matches.reduce((sum, expense) => sum + expense.yourShare, 0) * 100) / 100;
    return ok(
      { expenses: rows, totals: { count: matches.length, total, yourShare }, truncated: rows.length < matches.length },
      matches.length ? `${matches.length} shared ${matches.length === 1 ? "expense" : "expenses"} totalling ${formatNpr(total)}; your share ${formatNpr(yourShare)}.` : "No shared expenses match.",
    );
  } catch (error) {
    return agentError(error);
  }
}

/** Adds a shared expense by names. See the OpenAPI spec for how `splitWith`, `excludeMe` and `split` combine. */
export async function POST(request: NextRequest) {
  try {
    const { userId, viaApiKey } = await requireAgentIdentity(request);
    // A bot writes as you, so the write has to reach your own feed too.
    const limited = spendWrite(userId);
    if (limited) return limited;
    const parsed = expenseInput(todayInKathmandu()).safeParse(await readJson(request));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const [book, account] = await Promise.all([getShareBook(userId), accountOf(userId)]);
    const plan = planExpense(book, parsed.data, { accountName: account.name });
    const groupId = plan.directWith ? await ensureDirectGroup(userId, plan.directWith) : plan.write.groupId;
    const id = await createSharedExpense(userId, { ...plan.write, groupId });
    const detail = await describeSharedWrite(userId, { kind: "expense", action: "added", expenseId: id });

    const where = plan.directWith
      ? `with ${plan.scope.members.find((member) => member.id === plan.directWith)?.name}`
      : plan.scope.kind === "outside"
        ? "outside any group"
        : `in ${whereText(plan.scope)}`;
    const payer = plan.write.paidById === plan.scope.selfId ? "you" : plan.scope.members.find((member) => member.id === plan.write.paidById)?.name;
    const shares = plan.splits.map((share) => ({
      personId: share.personId,
      name: share.personId === plan.scope.selfId ? "You" : (plan.scope.members.find((member) => member.id === share.personId)?.name ?? "Someone"),
      amount: share.amount,
    }));
    if (detail) notifySharedWrite({ ...detail, includeActor: viaApiKey });
    return ok(
      { id, groupId, description: plan.write.description, amount: plan.write.amount, date: plan.write.date, paidBy: payer, splitMode: plan.write.splitMode, category: plan.write.category, shares },
      `Added "${plan.write.description}" ${formatNpr(plan.write.amount)} ${where}, paid by ${payer}. ${describeSplits(plan.scope, plan.write.splitMode, plan.splits)}`,
      201,
    );
  } catch (error) {
    return agentError(error);
  }
}
