import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { expenseTransactions, groupMembers, groups, people, settlements, sharedExpenses, sharedSplits, transactions } from "@/db/schema";
import { buildSplits } from "@/lib/split";
import { sampleExpenses, sampleGroup, samplePeople, sampleSettlements } from "@/lib/sample-book";

/**
 * The demo book, for an empty ledger to look like a used one.
 *
 * Every id is namespaced under the user, so two accounts can both seed without
 * colliding, and re-seeding updates rather than duplicating.
 */

export async function seedSampleBook(userId: string) {
  const db = getDb();
  // Use user-scoped IDs so two users can both seed without colliding.
  // Every sample entity is namespaced under the userId.
  const scopedId = (raw: string) => `${raw}--${userId}`;

  await db.transaction(async (tx) => {
    // Reuse the existing "You" person for this user if it exists, otherwise
    // the scopedId for "person-self" will be the seed placeholder.
    const selfRows = await tx
      .select()
      .from(people)
      .where(and(eq(people.userId, userId), eq(people.isSelf, true)));
    const selfId = selfRows[0]?.id ?? scopedId("person-self");
    const mapId = (raw: string) => (raw === "person-self" ? selfId : scopedId(raw));

    // Upsert people (scoped IDs → only this user's rows are touched).
    for (const person of samplePeople) {
      const id = mapId(person.id);
      await tx
        .insert(people)
        .values({ id, userId, name: person.name, isSelf: person.isSelf })
        .onConflictDoUpdate({
          target: people.id,
          set: { name: person.name, isSelf: person.isSelf, updatedAt: new Date() },
          setWhere: eq(people.userId, userId),
        });
    }

    const groupId = scopedId(sampleGroup.id);
    await tx
      .insert(groups)
      .values({ id: groupId, userId, name: sampleGroup.name })
      .onConflictDoUpdate({
        target: groups.id,
        set: { name: sampleGroup.name, updatedAt: new Date() },
        setWhere: eq(groups.userId, userId),
      });
    await tx.delete(groupMembers).where(eq(groupMembers.groupId, groupId));
    await tx.insert(groupMembers).values(sampleGroup.memberIds.map((personId) => ({ groupId, personId: mapId(personId) })));

    const externalIds = [
      ...new Set([
        ...sampleExpenses.flatMap((expense) => expense.transactionExternalIds),
        ...sampleSettlements.map((settlement) => settlement.transactionExternalId).filter((id): id is string => Boolean(id)),
      ]),
    ];
    const bankRows = externalIds.length
      ? await tx
          .select({ id: transactions.id, externalId: transactions.externalId })
          .from(transactions)
          .where(and(inArray(transactions.externalId, externalIds), eq(transactions.userId, userId)))
      : [];
    const bankId = new Map(bankRows.map((row) => [row.externalId, row.id]));

    for (const expense of sampleExpenses) {
      const expenseId = scopedId(expense.id);
      const expenseGroupId = expense.groupId ? scopedId(expense.groupId) : null;
      const paidById = mapId(expense.paidById);
      const participants = expense.participants.map((participant) => ({ ...participant, personId: mapId(participant.personId) }));
      const splits = buildSplits({
        mode: expense.splitMode,
        total: expense.amount,
        paidById,
        participants,
      });
      await tx
        .insert(sharedExpenses)
        .values({
          id: expenseId,
          userId,
          groupId: expenseGroupId,
          createdByUserId: userId,
          updatedByUserId: userId,
          description: expense.description,
          date: expense.date,
          amount: expense.amount,
          currency: "NPR",
          paidById,
          splitMode: expense.splitMode,
          note: expense.note,
        })
        .onConflictDoUpdate({
          target: sharedExpenses.id,
          set: {
            groupId: expenseGroupId,
            updatedByUserId: userId,
            description: expense.description,
            date: expense.date,
            amount: expense.amount,
            paidById,
            splitMode: expense.splitMode,
            note: expense.note,
            updatedAt: new Date(),
          },
          setWhere: eq(sharedExpenses.userId, userId),
        });
      await tx.delete(sharedSplits).where(eq(sharedSplits.expenseId, expenseId));
      await tx.insert(sharedSplits).values(
        splits.map((split) => ({
          expenseId,
          personId: split.personId,
          amount: split.amount,
          weight: split.weight,
        })),
      );
      await tx.delete(expenseTransactions).where(eq(expenseTransactions.expenseId, expenseId));
      const links = expense.transactionExternalIds.map((externalId) => bankId.get(externalId)).filter((id): id is string => Boolean(id));
      if (links.length) {
        await tx.insert(expenseTransactions).values(links.map((transactionId) => ({ expenseId, transactionId })));
      }
    }

    for (const settlement of sampleSettlements) {
      const settlementId = scopedId(settlement.id);
      const settlementGroupId = settlement.groupId ? scopedId(settlement.groupId) : null;
      const transactionId = settlement.transactionExternalId ? bankId.get(settlement.transactionExternalId) ?? null : null;
      const fromPersonId = mapId(settlement.fromPersonId);
      const toPersonId = mapId(settlement.toPersonId);
      await tx
        .insert(settlements)
        .values({
          id: settlementId,
          userId,
          groupId: settlementGroupId,
          createdByUserId: userId,
          updatedByUserId: userId,
          fromPersonId,
          toPersonId,
          amount: settlement.amount,
          currency: "NPR",
          date: settlement.date,
          note: settlement.note,
          transactionId,
        })
        .onConflictDoUpdate({
          target: settlements.id,
          set: {
            groupId: settlementGroupId,
            updatedByUserId: userId,
            fromPersonId,
            toPersonId,
            amount: settlement.amount,
            date: settlement.date,
            note: settlement.note,
            transactionId,
            updatedAt: new Date(),
          },
          setWhere: eq(settlements.userId, userId),
        });
    }
  });
}
