import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { groupMembers, groupUserAccess, groups, people } from "@/db/schema";
import { ShareInputError } from "@/lib/split";
import type { Scope } from "@/db/shares/types";

/**
 * Who may see and who may change a row.
 *
 * Every function here answers one question about an *actor*, and every answer is
 * derived from an explicit grant in `group_user_access` — never from a row merely
 * existing, and never from a nullable owner. Nothing in this file takes a
 * `userId | null`: a caller that has not proved who it is cannot get this far.
 */

export async function requirePeople(userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const rows = await getDb()
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.userId, userId), inArray(people.id, unique)));
  if (rows.length !== unique.length) throw new ShareInputError("One of those people is not in the book.");
}

export async function memberAccess(actorId: string, groupId: string) {
  const [access] = await getDb()
    .select()
    .from(groupUserAccess)
    .where(and(eq(groupUserAccess.groupId, groupId), eq(groupUserAccess.userId, actorId), eq(groupUserAccess.role, "member")))
    .limit(1);
  return access ?? null;
}

export async function groupScope(actorId: string, groupId: string | null | undefined): Promise<Scope> {
  if (!groupId) return { ownerId: actorId, isOwner: true };
  const [group] = await getDb().select({ userId: groups.userId }).from(groups).where(eq(groups.id, groupId)).limit(1);
  if (group?.userId === actorId) return { ownerId: actorId, isOwner: true };
  const access = group?.userId ? await memberAccess(actorId, groupId) : null;
  if (!access || access.ownerUserId !== group?.userId) throw new ShareInputError("That group is not in the book.");
  return { ownerId: access.ownerUserId, isOwner: false };
}

export async function requireGroupMembers(groupId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const rows = await getDb()
    .select({ id: groupMembers.personId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), inArray(groupMembers.personId, unique)));
  if (rows.length !== unique.length) throw new ShareInputError("Everyone in a shared group entry must be a member of that group.");
}

export async function rowScope(actorId: string, row: { userId: string; groupId: string | null }): Promise<Scope | null> {
  if (row.userId === actorId) return { ownerId: actorId, isOwner: true };
  if (!row.groupId) return null;
  const access = await memberAccess(actorId, row.groupId);
  return access && access.ownerUserId === row.userId ? { ownerId: row.userId, isOwner: false } : null;
}

export async function mutationScope(
  actorId: string,
  row: { userId: string; groupId: string | null; createdByUserId: string | null },
): Promise<Scope | null> {
  const scope = await rowScope(actorId, row);
  if (!scope || (!scope.isOwner && row.createdByUserId !== actorId)) return null;
  return scope;
}
