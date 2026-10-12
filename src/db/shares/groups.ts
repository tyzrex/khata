import { and, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { groupMembers, groups, groupUserAccess, people, settlements, sharedExpenses, sharedSplits } from "@/db/schema";
import { NotFoundError } from "@/server/errors";
import { pairwiseDebts, ShareInputError } from "@/lib/split";
import { requirePeople } from "@/db/shares/permissions";
import { loadJoinedGroup } from "@/db/shares/read";
import { ensureSelf } from "@/db/shares/people";
import { expireAffected } from "@/db/shares/affected";

/**
 * Groups, and the hidden two-person book behind a friendship.
 *
 * A "direct" group is not a group: it is the private channel between you and one
 * friend, created the first time an expense names them. Its two members define
 * it, so it can be neither renamed nor given anyone else.
 */

export async function createGroup(userId: string, name: string, memberIds: string[]) {
  const unique = [...new Set(memberIds)];
  await requirePeople(userId, unique);
  const id = crypto.randomUUID();
  await getDb().transaction(async (tx) => {
    await tx.insert(groups).values({ id, userId, name });
    await tx.insert(groupMembers).values(unique.map((personId) => ({ groupId: id, personId })));
    await tx.insert(groupUserAccess).values({ groupId: id, userId, ownerUserId: userId, role: "owner" });
  });
  return id;
}

/**
 * The hidden two-person book between you and one friend. Expenses added "with a
 * friend" live here, so the friend sees them as soon as they have an account.
 * Created on first use. If the friend already has an account the access row is
 * granted right away.
 */
export async function ensureDirectGroup(userId: string, personId: string) {
  const self = await ensureSelf(userId);
  const db = getDb();
  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.userId, userId)))
    .limit(1);
  if (!person) throw new NotFoundError("That person is not in the book.");
  if (person.isSelf) throw new ShareInputError("You cannot be your own friend.");

  let granted = false;
  const groupId = await db.transaction(async (tx) => {
    // Two first expenses with the same new friend would each see "no book yet" and each create
    // one, splitting the balance across two. Serialise on the pair; the lock drops at commit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`direct:${userId}:${personId}`}, 0))`);
    const [existing] = await tx
      .select({ id: groups.id })
      .from(groups)
      .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
      .where(and(eq(groups.userId, userId), eq(groups.kind, "direct"), eq(groupMembers.personId, personId)))
      .limit(1);
    const id = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      await tx.insert(groups).values({ id, userId, name: "Direct", kind: "direct" });
      await tx.insert(groupMembers).values([
        { groupId: id, personId: self.id },
        { groupId: id, personId },
      ]);
      await tx.insert(groupUserAccess).values({ groupId: id, userId, ownerUserId: userId, role: "owner" });
    }
    if (person.linkedUserId) {
      const added = await tx
        .insert(groupUserAccess)
        .values({ groupId: id, userId: person.linkedUserId, ownerUserId: userId, role: "member" })
        .onConflictDoNothing()
        .returning({ userId: groupUserAccess.userId });
      granted = added.length > 0;
    }
    return id;
  });
  // The friend just gained a book they could not see a moment ago.
  if (granted) expireAffected([person.linkedUserId]);
  return groupId;
}

export async function updateGroup(userId: string, id: string, input: { name?: string; memberIds?: string[] }) {
  const [group] = await getDb()
    .select()
    .from(groups)
    .where(and(eq(groups.id, id), eq(groups.userId, userId)))
    .limit(1);
  if (!group) throw new NotFoundError("That group is not in the book.");
  // The hidden two-person book is defined by its two members; editing it would
  // turn a friendship into an unlisted group the friend never agreed to.
  if (group.kind === "direct") throw new ShareInputError("A friend's book cannot be renamed or given other members.");
  const unique = input.memberIds ? [...new Set(input.memberIds)] : undefined;
  if (unique) await requirePeople(userId, unique);
  const holders = await memberAccessUserIds(id);
  if (unique) await requireRemovable(userId, id, unique);
  await getDb().transaction(async (tx) => {
    if (input.name) {
      await tx
        .update(groups)
        .set({ name: input.name, updatedAt: new Date() })
        .where(and(eq(groups.id, id), eq(groups.userId, userId)));
    }
    if (unique) {
      await tx.delete(groupMembers).where(eq(groupMembers.groupId, id));
      if (unique.length) {
        await tx.insert(groupMembers).values(unique.map((personId) => ({ groupId: id, personId })));
      }
      // Revoke access for any linked account whose person row is no longer a
      // member of this group. Without this, removing someone from the member
      // list leaves their Khata account able to read and write the group.
      const keepRows = unique.length
        ? await tx
            .select({ linkedUserId: people.linkedUserId })
            .from(people)
            .where(and(eq(people.userId, userId), inArray(people.id, unique)))
        : [];
      const keepUserIds = keepRows.map((row) => row.linkedUserId).filter((value): value is string => Boolean(value));
      await tx
        .delete(groupUserAccess)
        .where(
          and(
            eq(groupUserAccess.groupId, id),
            eq(groupUserAccess.role, "member"),
            keepUserIds.length ? notInArray(groupUserAccess.userId, keepUserIds) : undefined,
          ),
        );
    }
  });
  // Members lose access, or see a different roster; none of them made this call.
  expireAffected(holders);
}

async function memberAccessUserIds(groupId: string) {
  const rows = await getDb()
    .select({ userId: groupUserAccess.userId })
    .from(groupUserAccess)
    .where(and(eq(groupUserAccess.groupId, groupId), eq(groupUserAccess.role, "member")));
  return rows.map((row) => row.userId);
}

/**
 * Refuse to drop a person who still appears in the group's money.
 *
 * Removing them keeps their splits and payments in the balances while taking away their
 * ability to see or settle them — a debt nobody can clear. `leaveGroup` already demands a
 * zero balance; this holds the owner to the same rule, and goes further by also refusing
 * anyone with any entry left, since the entry would stay behind pointing at a non-member.
 */
async function requireRemovable(ownerId: string, groupId: string, keepIds: string[]) {
  const db = getDb();
  const current = await db.select({ personId: groupMembers.personId }).from(groupMembers).where(eq(groupMembers.groupId, groupId));
  const removed = current.map((member) => member.personId).filter((personId) => !keepIds.includes(personId));
  if (!removed.length) return;

  const [asSplit, asPayer, asSettler] = await Promise.all([
    db
      .select({ personId: sharedSplits.personId })
      .from(sharedSplits)
      .innerJoin(sharedExpenses, eq(sharedExpenses.id, sharedSplits.expenseId))
      .where(and(eq(sharedExpenses.userId, ownerId), eq(sharedExpenses.groupId, groupId), inArray(sharedSplits.personId, removed))),
    db
      .select({ personId: sharedExpenses.paidById })
      .from(sharedExpenses)
      .where(and(eq(sharedExpenses.userId, ownerId), eq(sharedExpenses.groupId, groupId), inArray(sharedExpenses.paidById, removed))),
    db
      .select({ from: settlements.fromPersonId, to: settlements.toPersonId })
      .from(settlements)
      .where(
        and(
          eq(settlements.userId, ownerId),
          eq(settlements.groupId, groupId),
          or(inArray(settlements.fromPersonId, removed), inArray(settlements.toPersonId, removed)),
        ),
      ),
  ]);
  const stuck = new Set([...asSplit.map((row) => row.personId), ...asPayer.map((row) => row.personId), ...asSettler.flatMap((row) => [row.from, row.to])]);
  const blocked = removed.filter((personId) => stuck.has(personId));
  if (!blocked.length) return;
  const named = await db.select({ name: people.name }).from(people).where(and(eq(people.userId, ownerId), inArray(people.id, blocked)));
  const who = named.map((row) => row.name).join(", ");
  throw new ShareInputError(`${who} still ${named.length === 1 ? "has" : "have"} expenses or payments in this group. Delete or reassign those before removing them.`);
}

/** Whether anyone in the group owes anyone, counting its expenses and settlements together. */
async function groupHasOpenBalance(ownerId: string, groupId: string) {
  const db = getDb();
  const [expenseRows, settlementRows] = await Promise.all([
    db.select().from(sharedExpenses).where(and(eq(sharedExpenses.userId, ownerId), eq(sharedExpenses.groupId, groupId))),
    db.select().from(settlements).where(and(eq(settlements.userId, ownerId), eq(settlements.groupId, groupId))),
  ]);
  const ids = expenseRows.map((expense) => expense.id);
  const splitRows = ids.length ? await db.select().from(sharedSplits).where(inArray(sharedSplits.expenseId, ids)) : [];
  const debts = pairwiseDebts(
    expenseRows.map((expense) => ({
      groupId: expense.groupId,
      paidById: expense.paidById,
      splits: splitRows.filter((split) => split.expenseId === expense.id).map((split) => ({ personId: split.personId, amount: split.amount })),
    })),
    settlementRows.map((settlement) => ({
      groupId: settlement.groupId,
      fromPersonId: settlement.fromPersonId,
      toPersonId: settlement.toPersonId,
      amount: settlement.amount,
    })),
    groupId,
  );
  return debts.length > 0;
}

export async function leaveGroup(userId: string, groupId: string) {
  const [access] = await getDb()
    .select({ ownerUserId: groupUserAccess.ownerUserId })
    .from(groupUserAccess)
    .where(and(eq(groupUserAccess.groupId, groupId), eq(groupUserAccess.userId, userId), eq(groupUserAccess.role, "member")))
    .limit(1);
  if (!access) throw new NotFoundError("That group membership was not found.");

  const group = await loadJoinedGroup(userId, groupId, access.ownerUserId);
  if (!group) throw new NotFoundError("That group membership was not found.");
  if (group.balances.youOwe.length || group.balances.youAreOwed.length) {
    throw new ShareInputError("Settle your open balance before leaving this group.");
  }

  const [removed] = await getDb()
    .delete(groupUserAccess)
    .where(and(eq(groupUserAccess.groupId, groupId), eq(groupUserAccess.userId, userId), eq(groupUserAccess.role, "member")))
    .returning({ groupId: groupUserAccess.groupId });
  if (!removed) throw new NotFoundError("That group membership was not found.");
  // The owner's roster of who can see this group just got shorter.
  expireAffected([access.ownerUserId]);
}

export async function deleteGroup(userId: string, id: string) {
  const db = getDb();
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, id), eq(groups.userId, userId)))
    .limit(1);
  if (!group) throw new NotFoundError("That group is not in the book.");
  // Deleting takes every member's expenses with it and writes no audit trail, so it is only
  // for a group nobody owes anything in. Settle up first.
  if (await groupHasOpenBalance(userId, id)) {
    throw new ShareInputError("Settle this group's open balances before deleting it. Deleting would erase what people owe each other.");
  }
  const holders = await memberAccessUserIds(id);
  await db.transaction(async (tx) => {
    // Remove the group's own data instead of orphaning it. Deleting the group
    // alone would leave its expenses and settlements behind with a null
    // group_id, still counted in the overall balances. splits and expense
    // links cascade from shared_expenses; members, access, and invites cascade
    // from the group row.
    await tx.delete(sharedExpenses).where(and(eq(sharedExpenses.userId, userId), eq(sharedExpenses.groupId, id)));
    await tx.delete(settlements).where(and(eq(settlements.userId, userId), eq(settlements.groupId, id)));
    await tx.delete(groups).where(and(eq(groups.id, id), eq(groups.userId, userId)));
  });
  expireAffected(holders);
}
