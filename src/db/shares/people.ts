import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { groupMembers, groups, groupUserAccess, people } from "@/db/schema";
import { NotFoundError, pgCode } from "@/server/errors";
import { ShareInputError } from "@/lib/split";
import { expireAffected } from "@/db/shares/affected";

/** People in one account's book, including the row that stands for "you". */

export async function ensureSelf(userId: string) {
  const db = getDb();
  const existing = await db
    .select()
    .from(people)
    .where(and(eq(people.userId, userId), eq(people.isSelf, true)))
    .limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db
    .insert(people)
    .values({ id: `self-${userId}`, userId, name: "You", isSelf: true })
    .returning();
  return created;
}

export async function createPerson(userId: string, name: string) {
  const [row] = await getDb()
    .insert(people)
    .values({ id: crypto.randomUUID(), userId, name, isSelf: false })
    .returning();
  return { id: row.id, name: row.name, isSelf: row.isSelf };
}

export async function renamePerson(userId: string, id: string, name: string) {
  const [row] = await getDb()
    .update(people)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(people.id, id), eq(people.userId, userId)))
    .returning();
  if (!row) throw new NotFoundError("That person is not in the book.");
  return { id: row.id, name: row.name, isSelf: row.isSelf };
}

export async function deletePerson(userId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.userId, userId)))
    .limit(1);
  if (!row) throw new NotFoundError("That person is not in the book.");
  if (row.isSelf) throw new ShareInputError("You stay in the book. Rename yourself instead.");
  try {
    await getDb().transaction(async (tx) => {
      if (row.linkedUserId) {
        const owned = tx.select({ id: groups.id }).from(groups).where(eq(groups.userId, userId));
        await tx
          .delete(groupUserAccess)
          .where(and(eq(groupUserAccess.userId, row.linkedUserId), eq(groupUserAccess.role, "member"), inArray(groupUserAccess.groupId, owned)));
      }
      // The hidden two-person book behind this friendship goes with them.
      const direct = await tx
        .select({ id: groups.id })
        .from(groups)
        .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
        .where(and(eq(groups.userId, userId), eq(groups.kind, "direct"), eq(groupMembers.personId, id)));
      if (direct.length) {
        await tx.delete(groups).where(
          and(
            eq(groups.userId, userId),
            inArray(
              groups.id,
              direct.map((group) => group.id),
            ),
          ),
        );
      }
      await tx.delete(people).where(and(eq(people.id, id), eq(people.userId, userId)));
    });
  } catch (error) {
    if (pgCode(error) === "23503") {
      throw new ShareInputError("This person still has a shared expense or a settlement. Clear those first.");
    }
    throw error;
  }
  // The friend lost access to every book of yours, and the direct one is gone.
  expireAffected([row.linkedUserId]);
}
