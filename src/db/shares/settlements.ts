import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { expenseTransactions, settlements, transactions } from "@/db/schema";
import { ShareInputError } from "@/lib/split";
import { ConflictError, NotFoundError } from "@/server/errors";
import { groupScope, mutationScope, requireGroupMembers, requirePeople } from "@/db/shares/permissions";
import type { Scope, SettlementInput } from "@/db/shares/types";

/**
 * Settlements: a promise between people that money changed hands.
 *
 * Unlike expenses these keep no revision history, which is why a delete has to
 * describe the row before removing it — there is nothing left afterwards to
 * describe it from.
 */

async function settlementWriteScope(
  actorId: string,
  input: SettlementInput,
  existing: typeof settlements.$inferSelect | null,
): Promise<Scope> {
  if (!existing) return groupScope(actorId, input.groupId);
  const current = await mutationScope(actorId, existing);
  if (!current) throw new NotFoundError("That settlement is not in the book.");
  if (!current.isOwner) {
    if ((input.groupId ?? null) !== existing.groupId) {
      throw new ShareInputError("Only the group owner can move a settlement to another group.");
    }
    return current;
  }
  const requested = await groupScope(actorId, input.groupId);
  if (!requested.isOwner || requested.ownerId !== existing.userId) {
    throw new ShareInputError("A settlement can only be moved within its owner's ledger.");
  }
  return requested;
}

async function validateSettlementWrite(
  scope: Scope,
  input: SettlementInput,
  exceptSettlementId?: string,
) {
  if (input.fromPersonId === input.toPersonId) throw new ShareInputError("A settlement needs two different people.");
  await requirePeople(scope.ownerId, [input.fromPersonId, input.toPersonId]);
  const transactionId = input.transactionId ?? null;
  if (!scope.isOwner) {
    await requireGroupMembers(input.groupId!, [input.fromPersonId, input.toPersonId]);
    if (transactionId) throw new ShareInputError("Bank lines can only be linked by the person who owns that ledger.");
  }
  if (transactionId) {
    const [bank] = await getDb()
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, scope.ownerId)))
      .limit(1);
    if (!bank) throw new ShareInputError("That bank line is not in the ledger.");
    const [expenseLink] = await getDb()
      .select({ expenseId: expenseTransactions.expenseId })
      .from(expenseTransactions)
      .where(eq(expenseTransactions.transactionId, transactionId))
      .limit(1);
    if (expenseLink) throw new ShareInputError("That bank line is already linked to a shared expense.");
    const [other] = await getDb()
      .select({ id: settlements.id })
      .from(settlements)
      .where(and(eq(settlements.transactionId, transactionId), eq(settlements.userId, scope.ownerId)))
      .limit(1);
    if (other && other.id !== exceptSettlementId) throw new ShareInputError("That bank line is already linked to a settlement.");
  }
  return transactionId;
}

export async function createSettlement(userId: string, input: SettlementInput) {
  const scope = await settlementWriteScope(userId, input, null);
  const transactionId = await validateSettlementWrite(scope, input);
  const id = crypto.randomUUID();
  await getDb().insert(settlements).values({
    id,
    userId: scope.ownerId,
    groupId: input.groupId ?? null,
    createdByUserId: userId,
    updatedByUserId: userId,
    fromPersonId: input.fromPersonId,
    toPersonId: input.toPersonId,
    amount: input.amount,
    currency: "NPR",
    date: input.date,
    note: input.note,
    transactionId,
  });
  return id;
}

export async function updateSettlement(userId: string, id: string, input: SettlementInput) {
  const [existing] = await getDb().select().from(settlements).where(eq(settlements.id, id)).limit(1);
  if (!existing) throw new NotFoundError("That settlement is not in the book.");
  const scope = await settlementWriteScope(userId, input, existing);
  if (input.version === undefined) throw new ShareInputError("Include the current version to update this settlement.");
  if (input.version !== existing.version) {
    throw new ConflictError("This settlement changed since you opened it. Refresh it and try again.");
  }
  const transactionId = await validateSettlementWrite(scope, input, id);
  const [updated] = await getDb()
    .update(settlements)
    .set({
      groupId: input.groupId ?? null,
      fromPersonId: input.fromPersonId,
      toPersonId: input.toPersonId,
      amount: input.amount,
      date: input.date,
      note: input.note,
      transactionId,
      updatedByUserId: userId,
      version: sql`${settlements.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(settlements.id, id), eq(settlements.userId, existing.userId), eq(settlements.version, input.version)))
    .returning({ id: settlements.id });
  if (!updated) throw new ConflictError("This settlement changed since you opened it. Refresh it and try again.");
  return id;
}

export async function deleteSettlement(userId: string, id: string) {
  const [existing] = await getDb().select().from(settlements).where(eq(settlements.id, id)).limit(1);
  const scope = existing ? await mutationScope(userId, existing) : null;
  if (!existing || !scope) throw new NotFoundError("That settlement is not in the book.");
  const [deleted] = await getDb()
    .delete(settlements)
    .where(and(eq(settlements.id, id), eq(settlements.userId, scope.ownerId), eq(settlements.version, existing.version)))
    .returning({ id: settlements.id });
  if (!deleted) throw new ConflictError("This settlement changed just before deletion. Refresh it and try again.");
}
