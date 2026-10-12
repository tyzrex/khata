import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { expenseTransactions, people, settlements, sharedExpenseRevisions, sharedExpenses, sharedSplits, transactions } from "@/db/schema";
import { buildSplits, ShareInputError, type SplitMode } from "@/lib/split";
import { ConflictError, NotFoundError } from "@/server/errors";
import { groupScope, mutationScope, requireGroupMembers, requirePeople } from "@/db/shares/permissions";
import { loadUserNames } from "@/db/shares/names";
import type { Scope, SharedExpenseInput } from "@/db/shares/types";

/**
 * Shared expenses: who paid, who owes what, and the audit trail of every change.
 *
 * Two rules shape everything here. A member of a joined group may only change
 * entries they created, checked against `created_by_user_id` — owning the ledger
 * is not permission to edit somebody's row. And updates carry the version the
 * editor opened into the SQL `WHERE` clause, so a lost update is a 409 rather than
 * a silent overwrite.
 */

async function assertExpenseLinks(userId: string, transactionIds: string[], exceptExpenseId?: string) {
  const unique = [...new Set(transactionIds)];
  if (unique.length === 0) return unique;
  const rows = await getDb()
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), inArray(transactions.id, unique)));
  if (rows.length !== unique.length) throw new ShareInputError("One of those bank lines is not in the ledger.");
  const usedBySettlement = await getDb()
    .select({ id: settlements.id })
    .from(settlements)
    .where(and(eq(settlements.userId, userId), inArray(settlements.transactionId, unique)));
  if (usedBySettlement.length) throw new ShareInputError("That bank line is already linked to a settlement.");
  const usedByExpense = await getDb().select().from(expenseTransactions).where(inArray(expenseTransactions.transactionId, unique));
  if (usedByExpense.some((link) => link.expenseId !== exceptExpenseId)) {
    throw new ShareInputError("That bank line is already linked to a shared expense.");
  }
  return unique;
}

async function expenseRevision(
  actorId: string,
  expense: typeof sharedExpenses.$inferSelect,
  action: "updated" | "deleted",
) {
  const [payer] = await getDb()
    .select({ name: people.name, isSelf: people.isSelf })
    .from(people)
    .where(and(eq(people.id, expense.paidById), eq(people.userId, expense.userId)))
    .limit(1);
  const splits = await getDb()
    .select({ personId: sharedSplits.personId, amount: sharedSplits.amount })
    .from(sharedSplits)
    .where(eq(sharedSplits.expenseId, expense.id));
  const names = await loadUserNames([actorId, expense.userId]);
  const paidByName = payer?.isSelf ? names.get(expense.userId) ?? payer.name : payer?.name ?? "Someone";
  return {
    id: crypto.randomUUID(),
    expenseId: expense.id,
    ownerUserId: expense.userId,
    groupId: expense.groupId,
    actorUserId: actorId,
    actorName: names.get(actorId) ?? "Someone",
    action,
    version: expense.version,
    snapshot: {
      description: expense.description,
      amount: expense.amount,
      date: expense.date,
      // Who was on the expense. Splits are deleted with it, so this is the only record of whom
      // a deleted or edited expense touched — the notification fan-out reads it back.
      paidById: expense.paidById,
      splits,
      paidByName,
      splitMode: expense.splitMode,
      category: expense.category,
      note: expense.note,
    },
  };
}

async function writeExpense(
  actorId: string,
  id: string,
  input: {
    description: string;
    date: string;
    amount: number;
    paidById: string;
    groupId?: string | null;
    splitMode: SplitMode;
    category?: string | null;
    note: string;
    participants: { personId: string; amount?: number; weight?: number }[];
    transactionIds: string[];
    version?: number;
  },
  existing: typeof sharedExpenses.$inferSelect | null,
) {
  const personIds = [input.paidById, ...input.participants.map((participant) => participant.personId)];
  let scope: Scope;
  if (existing) {
    const current = await mutationScope(actorId, existing);
    if (!current) throw new NotFoundError("That shared expense is not in the book.");
    if (input.version === undefined) throw new ShareInputError("Include the current version to update this shared expense.");
    if (input.version !== existing.version) {
      throw new ConflictError("This shared expense changed since you opened it. Refresh it and try again.");
    }
    if (current.isOwner) {
      const requested = await groupScope(actorId, input.groupId);
      if (!requested.isOwner || requested.ownerId !== existing.userId) {
        throw new ShareInputError("An expense can only be moved within its owner's ledger.");
      }
      scope = requested;
    } else if ((input.groupId ?? null) === existing.groupId) {
      scope = current;
    } else {
      throw new ShareInputError("Only the group owner can move an expense to another group.");
    }
  } else {
    scope = await groupScope(actorId, input.groupId);
  }
  await requirePeople(scope.ownerId, personIds);
  // The owner is held to this too: a person outside the group would otherwise land in its
  // balances without being able to see it.
  if (input.groupId) await requireGroupMembers(input.groupId, personIds);
  if (!scope.isOwner) {
    if (input.transactionIds.length) throw new ShareInputError("Bank lines can only be linked by the person who owns that ledger.");
  }
  const splits = buildSplits({
    mode: input.splitMode,
    total: input.amount,
    paidById: input.paidById,
    participants: input.participants,
  });
  const links = scope.isOwner ? await assertExpenseLinks(scope.ownerId, input.transactionIds, existing ? id : undefined) : [];
  const revision = existing ? await expenseRevision(actorId, existing, "updated") : null;
  const now = new Date();
  await getDb().transaction(async (tx) => {
    if (existing) {
      await tx.insert(sharedExpenseRevisions).values(revision!);
      const [updated] = await tx
        .update(sharedExpenses)
        .set({
          groupId: input.groupId ?? null,
          description: input.description,
          date: input.date,
          amount: input.amount,
          paidById: input.paidById,
          splitMode: input.splitMode,
          category: input.category ?? null,
          note: input.note,
          updatedByUserId: actorId,
          version: sql`${sharedExpenses.version} + 1`,
          updatedAt: now,
        })
        .where(and(eq(sharedExpenses.id, id), eq(sharedExpenses.userId, existing.userId), eq(sharedExpenses.version, input.version!)))
        .returning();
      if (!updated) throw new ConflictError("This shared expense changed since you opened it. Refresh it and try again.");
      await tx.delete(sharedSplits).where(eq(sharedSplits.expenseId, id));
      if (scope.isOwner) await tx.delete(expenseTransactions).where(eq(expenseTransactions.expenseId, id));
    } else {
      await tx.insert(sharedExpenses).values({
        id,
        userId: scope.ownerId,
        groupId: input.groupId ?? null,
        createdByUserId: actorId,
        updatedByUserId: actorId,
        description: input.description,
        date: input.date,
        amount: input.amount,
        currency: "NPR",
        paidById: input.paidById,
        splitMode: input.splitMode,
        category: input.category ?? null,
        note: input.note,
      });
    }
    await tx.insert(sharedSplits).values(
      splits.map((split) => ({
        expenseId: id,
        personId: split.personId,
        amount: split.amount,
        weight: split.weight,
      })),
    );
    if (links.length) {
      await tx.insert(expenseTransactions).values(links.map((transactionId) => ({ expenseId: id, transactionId })));
    }
  });
  return id;
}

export async function createSharedExpense(userId: string, input: SharedExpenseInput) {
  return writeExpense(userId, crypto.randomUUID(), input, null);
}

export async function updateSharedExpense(userId: string, id: string, input: SharedExpenseInput) {
  const [existing] = await getDb()
    .select()
    .from(sharedExpenses)
    .where(eq(sharedExpenses.id, id))
    .limit(1);
  if (!existing) throw new NotFoundError("That shared expense is not in the book.");
  return writeExpense(userId, id, input, existing);
}

export async function deleteSharedExpense(userId: string, id: string) {
  const [existing] = await getDb().select().from(sharedExpenses).where(eq(sharedExpenses.id, id)).limit(1);
  const scope = existing ? await mutationScope(userId, existing) : null;
  if (!existing || !scope) throw new NotFoundError("That shared expense is not in the book.");
  const revision = await expenseRevision(userId, existing, "deleted");
  await getDb().transaction(async (tx) => {
    await tx.insert(sharedExpenseRevisions).values(revision);
    const [deleted] = await tx
      .delete(sharedExpenses)
      .where(and(eq(sharedExpenses.id, id), eq(sharedExpenses.userId, scope.ownerId), eq(sharedExpenses.version, existing.version)))
      .returning({ id: sharedExpenses.id });
    if (!deleted) throw new ConflictError("This shared expense changed just before deletion. Refresh it and try again.");
  });
}
