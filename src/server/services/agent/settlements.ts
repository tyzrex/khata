import { accountOf } from "@/db/agent";
import { ensureDirectGroup, getShareBook } from "@/db/shares";
import { personName, planSettlement, whereText } from "@/server/agent/plan";
import { settlementInput } from "@/server/agent/schemas";
import { todayInKathmandu } from "@/lib/period";
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
export async function listPayments(userId: string, query: Record<string, unknown> = {}): Promise<Rendered<unknown>> {
  const book = await getShareBook(userId);
  const { findGroup } = await import("@/server/agent/plan");
  const groupId = query.group ? findGroup(book, String(query.group)).groupId : null;
  const all = [...book.settlements, ...book.joinedGroups.flatMap((group) => group.settlements)]
    .filter((payment) => (!groupId || payment.groupId === groupId) && (!query.from || payment.date >= String(query.from)) && (!query.to || payment.date <= String(query.to)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const limit = Number(query.limit ?? 50);
  return { data: { settlements: all.slice(0, limit), count: all.length, truncated: all.length > limit }, message: `${all.length} recorded payments.` };
}

export async function readPayment(userId: string, id: string): Promise<Rendered<unknown>> {
  const book = await getShareBook(userId);
  const settlement = [...book.settlements, ...book.joinedGroups.flatMap((group) => group.settlements)].find((payment) => payment.id === id);
  if (!settlement) { const { NotFoundError } = await import("@/server/errors"); throw new NotFoundError("No recorded payment with that ID."); }
  return { data: { settlement }, message: `${settlement.fromName} paid ${settlement.toName} ${formatNpr(settlement.amount)}.` };
}

export async function editPayment(userId: string, id: string, payload: Record<string, unknown>, viaApiKey: boolean): Promise<Rendered<unknown>> {
  const book = await getShareBook(userId);
  const existing = [...book.settlements, ...book.joinedGroups.flatMap((group) => group.settlements)].find((payment) => payment.id === id);
  const { ConflictError, NotFoundError, ValidationError } = await import("@/server/errors");
  if (!existing) throw new NotFoundError("No recorded payment with that ID.");
  if (!Number.isInteger(payload.version) || Number(payload.version) <= 0) throw new ValidationError("Read the payment first and supply its current version.");
  if (payload.version !== existing.version) throw new ConflictError("This payment changed. Read it again before updating.");
  const parsed = settlementInput(todayInKathmandu()).safeParse({ ...payload, date: payload.date ?? existing.date, from: payload.from ?? existing.fromPersonId, to: payload.to ?? existing.toPersonId, note: payload.note ?? existing.note, group: payload.group === undefined ? existing.groupId : payload.group });
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid payment");
  const account = await accountOf(userId);
  const plan = planSettlement(book, parsed.data, { accountName: account.name });
  const { editSettlement } = await import("@/server/services/shared-writes");
  await editSettlement(userId, id, { ...plan.write, version: Number(payload.version), transactionId: existing.transaction?.id ?? null }, { includeActor: viaApiKey });
  return readPayment(userId, id);
}
