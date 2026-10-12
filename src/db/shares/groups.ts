import { and, eq, inArray, notInArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { groupMembers, groups, groupUserAccess, people, settlements, sharedExpenses } from "@/db/schema";
import { NotFoundError } from "@/server/errors";
import { ShareInputError } from "@/lib/split";
import { requirePeople } from "@/db/shares/permissions";
import { loadJoinedGroup } from "@/db/shares/read";
import { ensureSelf } from "@/db/shares/people";

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

  const existing = await db
    .select({ id: groups.id })
    .from(groups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
    .where(and(eq(groups.userId, userId), eq(groups.kind, "direct"), eq(groupMembers.personId, personId)))
    .limit(1);
  const groupId = existing[0]?.id ?? crypto.randomUUID();

  await db.transaction(async (tx) => {
    if (!existing[0]) {
      await tx.insert(groups).values({ id: groupId, userId, name: "Direct", kind: "direct" });
      await tx.insert(groupMembers).values([
        { groupId, personId: self.id },
        { groupId, personId },
      ]);
      await tx.insert(groupUserAccess).values({ groupId, userId, ownerUserId: userId, role: "owner" });
    }
    if (person.linkedUserId) {
      await tx
        .insert(groupUserAccess)
        .values({ groupId, userId: person.linkedUserId, ownerUserId: userId, role: "member" })
        .onConflictDoNothing();
    }
  });
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
}

export async function deleteGroup(userId: string, id: string) {
  const db = getDb();
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, id), eq(groups.userId, userId)))
    .limit(1);
  if (!group) throw new NotFoundError("That group is not in the book.");
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
}
