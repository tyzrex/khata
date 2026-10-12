import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { groups, people, user } from "@/db/schema";
import type { PersonDto } from "@/db/shares/types";

/**
 * Resolving an id to something a person can read.
 *
 * Every name here is looked up against the *owner's* roster, never the reader's:
 * an invited group member sees the same words the owner sees, and a person id
 * means nothing outside the book it belongs to.
 */

export function nameOf(list: PersonDto[], id: string) {
  return list.find((person) => person.id === id)?.name ?? "Someone";
}

export function iso(value: Date) {
  return value.toISOString();
}

export async function loadUserNames(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map<string, string>();
  const rows = await getDb().select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, unique));
  return new Map(rows.map((row) => [row.id, row.name]));
}

export type GroupLabel = { title: string; path: string };

export async function groupLabel(ownerId: string, groupId: string): Promise<GroupLabel | null> {
  const [group] = await getDb()
    .select({ name: groups.name, kind: groups.kind })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.userId, ownerId)))
    .limit(1);
  if (!group) return null;
  if (group.kind === "direct") {
    const [owner] = await getDb().select({ name: user.name }).from(user).where(eq(user.id, ownerId)).limit(1);
    return { title: owner?.name ?? "Shared expense", path: `/friends/${encodeURIComponent(groupId)}` };
  }
  return { title: group.name, path: `/groups/${encodeURIComponent(groupId)}` };
}


export async function displayName(userId: string): Promise<string> {
  const [account] = await getDb().select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
  return account?.name?.trim() || "Someone";
}

export async function personLabel(ownerId: string, personId: string): Promise<string> {
  const [person] = await getDb()
    .select({ name: people.name, isSelf: people.isSelf })
    .from(people)
    .where(and(eq(people.id, personId), eq(people.userId, ownerId)))
    .limit(1);
  if (!person) return "Someone";
  if (person.isSelf) return (await displayName(ownerId)) || "You";
  return person.name;
}
