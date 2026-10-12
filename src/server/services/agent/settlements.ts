import { accountOf } from "@/db/agent";
import { ensureDirectGroup, getShareBook } from "@/db/shares";
import { personName, planSettlement, whereText } from "@/server/agent/plan";
import { settlementInput } from "@/server/agent/schemas";
import { formatNpr } from "@/lib/format";
import { recordSettlement, removeSettlement } from "@/server/services/shared-writes";
import type { z } from "zod";
import type { Rendered } from "@/server/services/agent/balances";

/**
 * Records a payment that settles some or all of a balance. It does not touch the
 * bank ledger — a settlement is a promise between people, not a withdrawal.
 *
 * `planSettlement` decides where the payment belongs: settling with a friend
 * goes in that friend's book, and settling inside a group you were only invited
 * to has to land in the owner's ledger.
 */

export type SettlementDraft = z.infer<ReturnType<typeof settlementInput>>;

export async function recordPayment(userId: string, draft: SettlementDraft, viaApiKey: boolean): Promise<Rendered<unknown>> {
  const [book, account] = await Promise.all([getShareBook(userId), accountOf(userId)]);
  const plan = planSettlement(book, draft, { accountName: account.name });
  const groupId = plan.directWith ? await ensureDirectGroup(userId, plan.directWith) : plan.write.groupId;
  const id = await recordSettlement(userId, { ...plan.write, groupId }, { includeActor: viaApiKey });

  const from = personName(plan.scope, plan.write.fromPersonId);
  const to = personName(plan.scope, plan.write.toPersonId);
  const where = plan.directWith || plan.scope.kind !== "group" ? "" : ` in ${whereText(plan.scope)}`;
  const sentence = `${from[0]!.toUpperCase()}${from.slice(1)} paid ${to} ${formatNpr(plan.write.amount)}${where}`;

  return {
    data: { id, groupId, from, to, amount: plan.write.amount, date: plan.write.date },
    message: `Recorded: ${sentence}.`,
    status: 201,
  };
}

export async function deletePayment(userId: string, settlementId: string, viaApiKey: boolean): Promise<Rendered<{ id: string }>> {
  await removeSettlement(userId, settlementId, { includeActor: viaApiKey });
  return { data: { id: settlementId }, message: "Payment removed. Balances are updated." };
}