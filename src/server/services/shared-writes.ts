import { createSettlement, createSharedExpense, deleteSettlement, deleteSharedExpense, describeSharedWrite, updateSettlement, updateSharedExpense, type SettlementInput, type SharedExpenseInput, type SharedWriteActivity } from "@/db/shares";
import { notifySharedWrite } from "@/server/push";

/**
 * Writing to a shared book is two things that must always happen together: change
 * the balances, then tell the people in them.
 *
 * Routes used to open-code that pair eight times over, and the copies drifted —
 * a delete that described the row after removing it where a settlement had to
 * describe it before, because settlements keep no audit trail and expenses do.
 * Getting that backwards meant a deleted expense pushed no notification at all.
 * Here the ordering is part of the operation, so there is nothing to keep in sync.
 */

export type NotifyOptions = {
  /**
   * Set for writes made through `/api/v1`. A bot writes as you, so if the actor
   * were excluded the way an interactive session is, you would never hear about
   * the expense your own assistant just added.
   */
  includeActor?: boolean;
};

async function announce(actorId: string, activity: SharedWriteActivity, options?: NotifyOptions) {
  const detail = await describeSharedWrite(actorId, activity);
  if (detail) notifySharedWrite(options?.includeActor ? { ...detail, includeActor: true } : detail);
}

// --- shared expenses -------------------------------------------------------

export async function addSharedExpense(userId: string, input: SharedExpenseInput, options?: NotifyOptions) {
  const id = await createSharedExpense(userId, input);
  await announce(userId, { kind: "expense", action: "added", expenseId: id }, options);
  return id;
}

export async function editSharedExpense(userId: string, id: string, input: SharedExpenseInput, options?: NotifyOptions) {
  await updateSharedExpense(userId, id, input);
  await announce(userId, { kind: "expense", action: "updated", expenseId: id }, options);
}

export async function removeSharedExpense(userId: string, id: string, options?: NotifyOptions) {
  await deleteSharedExpense(userId, id);
  // After, not before: the row is gone, but the audit revision this write just
  // appended is what says who did it and what it was.
  await announce(userId, { kind: "expense", action: "deleted", expenseId: id }, options);
}

// --- settlements -----------------------------------------------------------

export async function recordSettlement(userId: string, input: SettlementInput, options?: NotifyOptions) {
  const id = await createSettlement(userId, input);
  await announce(userId, { kind: "settlement", action: "recorded", settlementId: id }, options);
  return id;
}

export async function editSettlement(userId: string, id: string, input: SettlementInput, options?: NotifyOptions) {
  await updateSettlement(userId, id, input);
  await announce(userId, { kind: "settlement", action: "updated", settlementId: id }, options);
}

export async function removeSettlement(userId: string, id: string, options?: NotifyOptions) {
  // Before, not after: settlements keep no audit trail, so the notification has
  // to be built from the row that is about to disappear.
  const detail = await describeSharedWrite(userId, { kind: "settlement", action: "deleted", settlementId: id });
  await deleteSettlement(userId, id);
  if (detail) {
    const payload = { ...detail, activity: { ...detail.activity, action: "deleted" as const } };
    notifySharedWrite(options?.includeActor ? { ...payload, includeActor: true } : payload);
  }
}