import type { NextRequest } from "next/server";
import { accountOf } from "@/db/agent";
import { createSettlement, ensureDirectGroup, getShareBook } from "@/db/shares";
import { personName, planSettlement, whereText } from "@/lib/agent/plan";
import { agentError, fail, ok, spendWrite, zodMessage } from "@/lib/agent/respond";
import { settlementInput } from "@/lib/agent/schemas";
import { formatNpr } from "@/lib/format";
import { readJson } from "@/lib/http";
import { todayInKathmandu } from "@/lib/period";
import { requireAgentUserId } from "@/lib/session";

/** Records a payment that settles some or all of a balance. It does not touch the bank ledger. */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAgentUserId(request);
    const limited = spendWrite(userId);
    if (limited) return limited;
    const parsed = settlementInput(todayInKathmandu()).safeParse(await readJson(request));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const [book, account] = await Promise.all([getShareBook(userId), accountOf(userId)]);
    const plan = planSettlement(book, parsed.data, { accountName: account.name });
    const groupId = plan.directWith ? await ensureDirectGroup(userId, plan.directWith) : plan.write.groupId;
    const id = await createSettlement(userId, { ...plan.write, groupId });
    const from = personName(plan.scope, plan.write.fromPersonId);
    const to = personName(plan.scope, plan.write.toPersonId);
    const where = plan.directWith || plan.scope.kind !== "group" ? "" : ` in ${whereText(plan.scope)}`;
    const sentence = `${from[0]!.toUpperCase()}${from.slice(1)} paid ${to} ${formatNpr(plan.write.amount)}${where}`;
    return ok({ id, groupId, from, to, amount: plan.write.amount, date: plan.write.date }, `Recorded: ${sentence}.`, 201);
  } catch (error) {
    return agentError(error);
  }
}
