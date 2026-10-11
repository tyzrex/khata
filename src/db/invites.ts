import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { groupInvites, groupMembers, groupUserAccess, groups, people, user } from "@/db/schema";
import { recordNotifications } from "@/db/notifications";
import { NotFoundError } from "@/db/shares";
import { ShareInputError } from "@/lib/split";

const INVITE_DAYS = 7;

export type InviteInfo = {
  groupName: string;
  /** A friend invite: the group is the hidden two-person book. */
  direct: boolean;
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
  const [inviter] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId)).limit(1);
  const inviterName = inviter?.name ?? "A friend";
  return {
    token,
    expiresAt,
    groupName: group.kind === "direct" ? inviterName : group.name,
    inviterName,
    inviterEmail: inviter?.email ?? null,
    direct: group.kind === "direct",
  };
}

export async function getInviteByToken(token: string): Promise<InviteInfo | null> {
  const db = getDb();
  const [row] = await db
    .select({
      invite: groupInvites,
      groupName: groups.name,
      kind: groups.kind,
      creatorName: user.name,
    })
    .from(groupInvites)
    .innerJoin(groups, eq(groups.id, groupInvites.groupId))
    .innerJoin(user, eq(user.id, groupInvites.creatorUserId))
    .where(eq(groupInvites.token, token))
    .limit(1);
  if (!row) return null;
  const direct = row.kind === "direct";
  return {
    groupName: direct ? row.creatorName : row.groupName,
    direct,
    creatorName: row.creatorName,
    inviteeEmail: row.invite.inviteeEmail,
    expired: row.invite.expiresAt < new Date(),
    used: Boolean(row.invite.inviteeEmail && row.invite.acceptedAt),
  };
}

export async function acceptInvite(userId: string, token: string): Promise<{ groupId: string; groupName: string; direct: boolean }> {
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
  const direct = group.kind === "direct";
  const [creator] = await db.select({ name: user.name }).from(user).where(eq(user.id, ownerId)).limit(1);
  const label = direct ? (creator?.name ?? "your friend") : group.name;
  if (existing) return { groupId: group.id, groupName: label, direct };

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

    // Joining any group makes you a friend: open the direct book with this person too.
    const directRows = await tx
      .select({ id: groups.id })
      .from(groups)
      .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
      .where(and(eq(groups.userId, ownerId), eq(groups.kind, "direct"), eq(groupMembers.personId, personId)));
    for (const row of directRows) {
      await tx.insert(groupUserAccess).values({ groupId: row.id, userId, ownerUserId: ownerId, role: "member" }).onConflictDoNothing();
    }

    if (invite.inviteeEmail) {
      const [marked] = await tx
        .update(groupInvites)
        .set({ acceptedAt: new Date(), acceptedByUserId: userId })
        .where(and(eq(groupInvites.id, invite.id), isNull(groupInvites.acceptedAt)))
        .returning({ id: groupInvites.id });
      if (!marked) throw new ShareInputError("This invite has already been used.");
    }
  });

  // The membership is already committed. A feed row is a courtesy, so a failure here
  // must not turn a successful join into an error — swallow it and let the join stand.
  // `dedupeKey` is scoped per user, so both rows can share one event key.
  try {
    const who = account.name || account.email;
    const where = direct ? "/balances" : `/groups/${group.id}`;
    await recordNotifications([
      {
        userId: ownerId,
        kind: "invite",
        title: direct ? `${who} joined your book` : `${who} joined ${label}`,
        detail: direct ? "You can now share a direct book with them." : `They can now see and add to ${label}.`,
        url: where,
        eventKey: `invite:joined:${group.id}:${userId}`,
      },
      {
        userId,
        kind: "invite",
        title: `You joined ${label}`,
        detail: `${creator?.name ?? "Someone"} invited you. Anything you share with them shows up for you both.`,
        url: where,
        eventKey: `invite:joined:${group.id}:${userId}`,
      },
    ]);
  } catch (error) {
    console.error("Invite notification failed", error);
  }

  return { groupId: group.id, groupName: label, direct };
}
