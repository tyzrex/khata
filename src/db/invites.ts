import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { groupInvites, groupMembers, groupUserAccess, groups, people, user } from "@/db/schema";
import { NotFoundError } from "@/db/shares";
import { ShareInputError } from "@/lib/split";

const INVITE_DAYS = 7;

export type InviteInfo = {
  groupName: string;
  creatorName: string;
  inviteeEmail: string | null;
  expired: boolean;
  used: boolean;
};

export async function createGroupInvite(
  userId: string,
  groupId: string,
  input: { email?: string; personId?: string },
) {
  const db = getDb();
  const [group] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.userId, userId)))
    .limit(1);
  if (!group) throw new NotFoundError("That group is not in the book.");

  let personId: string | null = null;
  if (input.personId) {
    const [person] = await db
      .select({ id: people.id, isSelf: people.isSelf, linkedUserId: people.linkedUserId })
      .from(people)
      .innerJoin(groupMembers, and(eq(groupMembers.personId, people.id), eq(groupMembers.groupId, groupId)))
      .where(and(eq(people.id, input.personId), eq(people.userId, userId)))
      .limit(1);
    if (!person) throw new ShareInputError("That person is not in this group.");
    if (person.isSelf || person.linkedUserId) throw new ShareInputError("That person already has an account.");
    personId = person.id;
  }

  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(groupInvites).values({
    id: crypto.randomUUID(),
    groupId,
    creatorUserId: userId,
    inviteeEmail: input.email?.trim().toLowerCase() || null,
    personId,
    token,
    expiresAt,
  });
  const [inviter] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
  return { token, expiresAt, groupName: group.name, inviterName: inviter?.name ?? "A friend" };
}

export async function getInviteByToken(token: string): Promise<InviteInfo | null> {
  const db = getDb();
  const [row] = await db
    .select({
      invite: groupInvites,
      groupName: groups.name,
      creatorName: user.name,
    })
    .from(groupInvites)
    .innerJoin(groups, eq(groups.id, groupInvites.groupId))
    .innerJoin(user, eq(user.id, groupInvites.creatorUserId))
    .where(eq(groupInvites.token, token))
    .limit(1);
  if (!row) return null;
  return {
    groupName: row.groupName,
    creatorName: row.creatorName,
    inviteeEmail: row.invite.inviteeEmail,
    expired: row.invite.expiresAt < new Date(),
    used: Boolean(row.invite.inviteeEmail && row.invite.acceptedAt),
  };
}

export async function acceptInvite(userId: string, token: string): Promise<{ groupId: string; groupName: string }> {
  const db = getDb();
  const [invite] = await db.select().from(groupInvites).where(eq(groupInvites.token, token)).limit(1);
  if (!invite) throw new NotFoundError("This invite link is not valid.");
  if (invite.expiresAt < new Date()) throw new ShareInputError("This invite link has expired. Ask for a new one.");

  const [group] = await db.select().from(groups).where(eq(groups.id, invite.groupId)).limit(1);
  if (!group?.userId) throw new NotFoundError("The group this invite was for no longer exists.");
  const ownerId = group.userId;
  if (ownerId === userId) throw new ShareInputError("You own this group already.");

  const [account] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId)).limit(1);
  if (!account) throw new NotFoundError("Your account could not be found.");

  const [existing] = await db
    .select()
    .from(groupUserAccess)
    .where(and(eq(groupUserAccess.groupId, group.id), eq(groupUserAccess.userId, userId)))
    .limit(1);
  if (existing) return { groupId: group.id, groupName: group.name };

  if (invite.inviteeEmail) {
    if (invite.acceptedAt) throw new ShareInputError("This invite has already been used.");
    if (account.email.trim().toLowerCase() !== invite.inviteeEmail) {
      throw new ShareInputError(`This invite was sent to ${invite.inviteeEmail}. Sign in with that address to join.`);
    }
  }

  await db.transaction(async (tx) => {
    const [linked] = await tx
      .select()
      .from(people)
      .where(and(eq(people.userId, ownerId), eq(people.linkedUserId, userId)))
      .limit(1);
    let personId = linked?.id;

    if (!personId && invite.personId) {
      const [claimed] = await tx
        .update(people)
        .set({ linkedUserId: userId, updatedAt: new Date() })
        .where(and(eq(people.id, invite.personId), eq(people.userId, ownerId), isNull(people.linkedUserId), eq(people.isSelf, false)))
        .returning({ id: people.id });
      personId = claimed?.id;
    }

    if (!personId) {
      const [created] = await tx
        .insert(people)
        .values({ id: crypto.randomUUID(), userId: ownerId, name: account.name || account.email, isSelf: false, linkedUserId: userId })
        .returning({ id: people.id });
      personId = created.id;
    }

    await tx.insert(groupMembers).values({ groupId: group.id, personId }).onConflictDoNothing();
    await tx.insert(groupUserAccess).values({ groupId: group.id, userId, ownerUserId: ownerId, role: "member" }).onConflictDoNothing();

    if (invite.inviteeEmail) {
      const [marked] = await tx
        .update(groupInvites)
        .set({ acceptedAt: new Date(), acceptedByUserId: userId })
        .where(and(eq(groupInvites.id, invite.id), isNull(groupInvites.acceptedAt)))
        .returning({ id: groupInvites.id });
      if (!marked) throw new ShareInputError("This invite has already been used.");
    }
  });

  return { groupId: group.id, groupName: group.name };
}
