import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { groupMembers, settlements, sharedExpenseRevisions, sharedExpenses, sharedSplits } from "@/db/schema";
import type { SharedActivity } from "@/db/push-activity";
import { displayName, groupLabel, personLabel, type GroupLabel } from "@/db/shares/names";
import type { SharedWriteActivity } from "@/db/shares/types";

/**
 * Turning a write into a notification.
 *
 * Read *after* the write committed, so creates, version-checked updates and
 * deletes all take one path. A row that no longer resolves — deleted, or a join
 * the owner never sees as their own group — yields null and the caller skips the
 * notification rather than inventing one.
 */

/** A committed write, described for the notification fan-out. */
export type SharedWriteDescription = {
  actorId: string;
  ownerId: string;
  groupId: string | null;
  personIds: string[];
  /** What an edit replaced: people who were on the old splits and the group it used to be in. */
  previous?: { groupId: string | null; personIds: string[] };
  activity: SharedActivity;
};

/** The people an audit snapshot says were on an expense: its payer and everyone it was split with. */
function snapshotPersonIds(snapshot: unknown): string[] | null {
  const value = snapshot as { paidById?: unknown; splits?: unknown } | null;
  if (!value || !Array.isArray(value.splits)) return null;
  const ids = (value.splits as { personId?: unknown }[]).map((split) => split.personId).filter((id): id is string => typeof id === "string");
  return typeof value.paidById === "string" ? [value.paidById, ...ids] : ids;
}

export async function describeSharedWrite(
  actorId: string,
  activity: SharedWriteActivity,
): Promise<SharedWriteDescription | null> {
  if (activity.kind === "expense") return describeExpenseWrite(actorId, activity.expenseId, activity.action);
  return describeSettlementWrite(actorId, activity.settlementId, activity.action);
}

async function describeExpenseWrite(
  actorId: string,
  expenseId: string,
  action: "added" | "updated" | "deleted",
): Promise<SharedWriteDescription | null> {
  if (action === "deleted") return describeDeletedExpense(actorId, expenseId);
  const [expense] = await getDb().select().from(sharedExpenses).where(eq(sharedExpenses.id, expenseId)).limit(1);
  if (!expense) return null;
  const group = expense.groupId ? await groupLabel(expense.userId, expense.groupId) : null;
  if (expense.groupId && !group) return null;
  const url = writeUrl("expense", group);
  const [actorName, splits] = await Promise.all([
    displayName(actorId),
    getDb().select({ personId: sharedSplits.personId }).from(sharedSplits).where(eq(sharedSplits.expenseId, expenseId)),
  ]);
  const previous = action === "updated" ? await previousState(expenseId, expense.version - 1) : undefined;
  return {
    actorId,
    ownerId: expense.userId,
    groupId: expense.groupId,
    personIds: [...new Set([expense.paidById, ...splits.map((split) => split.personId)])],
    ...(previous ? { previous } : {}),
    activity: {
      kind: "expense",
      action,
      actorName,
      description: expense.description,
      amount: expense.amount,
      title: group?.title ?? "Shared expense",
      url,
      tag: `khata-expense-${expenseId}`,
    },
  };
}

/**
 * What an edit replaced, read from the revision it wrote just before changing the row.
 * Without it, someone dropped from the split, or a group an expense was moved out of,
 * would never hear that their balance changed.
 */
async function previousState(expenseId: string, version: number): Promise<{ groupId: string | null; personIds: string[] } | undefined> {
  const [revision] = await getDb()
    .select()
    .from(sharedExpenseRevisions)
    .where(and(eq(sharedExpenseRevisions.expenseId, expenseId), eq(sharedExpenseRevisions.action, "updated"), eq(sharedExpenseRevisions.version, version)))
    .orderBy(desc(sharedExpenseRevisions.createdAt))
    .limit(1);
  if (!revision) return undefined;
  return { groupId: revision.groupId, personIds: snapshotPersonIds(revision.snapshot) ?? [] };
}

/** Deletes remove the row, so rebuild the push from the latest audit snapshot. */
async function describeDeletedExpense(
  actorId: string,
  expenseId: string,
): Promise<SharedWriteDescription | null> {
  const [revision] = await getDb()
    .select()
    .from(sharedExpenseRevisions)
    .where(eq(sharedExpenseRevisions.expenseId, expenseId))
    .orderBy(desc(sharedExpenseRevisions.createdAt))
    .limit(1);
  if (!revision || revision.action !== "deleted") return null;
  const group = revision.groupId ? await groupLabel(revision.ownerUserId, revision.groupId) : null;
  if (revision.groupId && !group) return null;
  const url = writeUrl("expense", group);
  const actorName = await displayName(actorId);
  return {
    actorId,
    ownerId: revision.ownerUserId,
    groupId: revision.groupId,
    personIds: snapshotPersonIds(revision.snapshot) ?? (await legacyGroupPersonIds(revision.groupId)),
    activity: {
      kind: "expense",
      action: "deleted",
      actorName,
      description: revision.snapshot.description,
      amount: revision.snapshot.amount,
      title: group?.title ?? "Shared expense",
      url,
      tag: `khata-expense-${expenseId}`,
    },
  };
}

async function describeSettlementWrite(
  actorId: string,
  settlementId: string,
  action: "recorded" | "updated" | "deleted",
): Promise<SharedWriteDescription | null> {
  const [settlement] = await getDb().select().from(settlements).where(eq(settlements.id, settlementId)).limit(1);
  // Settlements keep no audit trail, so a delete has nothing to describe.
  if (!settlement) return null;
  const group = settlement.groupId ? await groupLabel(settlement.userId, settlement.groupId) : null;
  if (settlement.groupId && !group) return null;
  const url = writeUrl("settlement", group);
  const [actorName, payerName, receiverName] = await Promise.all([
    displayName(actorId),
    personLabel(settlement.userId, settlement.fromPersonId),
    personLabel(settlement.userId, settlement.toPersonId),
  ]);
  return {
    actorId,
    ownerId: settlement.userId,
    groupId: settlement.groupId,
    personIds: [settlement.fromPersonId, settlement.toPersonId],
    activity: {
      kind: "settlement",
      action,
      actorName,
      payerName,
      receiverName,
      amount: settlement.amount,
      title: group?.title ?? "Settlement",
      url,
      tag: `khata-settlement-${settlementId}`,
    },
  };
}

/**
 * Revisions written before snapshots recorded their splits have no list of who was on the
 * expense. A group's members stand in for it (the audience is still narrowed to those with
 * access); outside a group there is nothing to go on, so only the owner is told rather than
 * the owner's whole contact list.
 */
async function legacyGroupPersonIds(groupId: string | null): Promise<string[]> {
  if (!groupId) return [];
  const rows = await getDb().select({ personId: groupMembers.personId }).from(groupMembers).where(eq(groupMembers.groupId, groupId));
  return rows.map((row) => row.personId);
}

function writeUrl(kind: "expense" | "settlement", group: GroupLabel | null): string {
  if (!group) return kind === "expense" ? "/friends" : "/balances";
  return group.path;
}
