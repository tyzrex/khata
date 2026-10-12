import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { categories, transactions } from "@/db/schema";
import { ConflictError, NotFoundError, isUniqueViolation } from "@/server/errors";
import { DEFAULT_CATEGORIES } from "@/lib/constants";
import type { CategoryDto } from "@/lib/types";

/**
 * Categories: a per-user list of names, referenced by transactions by name.
 *
 * Structurally this is the same shape as accounts (`db/accounts.ts`): seeded for
 * a brand-new book, renamed with the references following along, removable only
 * while unused. They are kept as two explicit modules rather than one generic
 * table helper because drizzle's row types do not survive that abstraction
 * without casts on every query, and because the two lists must never be unified:
 * the shared vocabulary an invited group member sees is a fixed list, never the
 * owner's personal categories (`lib/constants.ts`).
 */

function toCategory(row: typeof categories.$inferSelect): CategoryDto {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as CategoryDto["kind"],
    color: row.color,
    sortOrder: row.sortOrder,
  };
}

function defaultFor(name: string) {
  return DEFAULT_CATEGORIES.find((category) => category.name === name);
}

/**
 * Give a brand-new book its starting categories. Runs on the read path, so it has
 * to tell "never seeded" from "seeded and then renamed": seeding on any *missing*
 * default would resurrect a name the person deliberately changed. An empty table
 * is the only unambiguous signal, so every write path calls this before
 * ensureNamed — otherwise a first entry naming a custom category would leave the
 * book with one category and never gain the defaults.
 */
export async function ensureCategories(userId: string) {
  const db = getDb();
  const [existing] = await db.select({ id: categories.id }).from(categories).where(eq(categories.userId, userId)).limit(1);
  if (existing) return;
  await db
    .insert(categories)
    .values(
      DEFAULT_CATEGORIES.map((category) => ({
        id: crypto.randomUUID(),
        userId,
        name: category.name,
        kind: category.kind,
        color: category.color,
        sortOrder: category.sortOrder,
      })),
    )
    .onConflictDoNothing({ target: [categories.userId, categories.name] });
}

/** Adds a category the write referenced but the book does not have yet. */
export async function ensureNamedCategory(userId: string, name: string, kind: string) {
  const match = defaultFor(name);
  await getDb()
    .insert(categories)
    .values({
      id: crypto.randomUUID(),
      userId,
      name,
      kind: match?.kind ?? kind,
      color: match?.color ?? "#7c828a",
      sortOrder: match?.sortOrder ?? 200,
    })
    .onConflictDoNothing({ target: [categories.userId, categories.name] });
}

export async function listCategories(userId: string) {
  await ensureCategories(userId);
  const rows = await getDb().select().from(categories).where(eq(categories.userId, userId)).orderBy(asc(categories.sortOrder), asc(categories.name));
  return rows.map(toCategory);
}

export async function createCategory(userId: string, input: { name: string; kind: CategoryDto["kind"]; color: string }) {
  await ensureCategories(userId);
  try {
    const [row] = await getDb()
      .insert(categories)
      .values({ id: crypto.randomUUID(), userId, name: input.name, kind: input.kind, color: input.color, sortOrder: 200 })
      .returning();
    return toCategory(row);
  } catch (error) {
    // Two tabs saving the same new name is the usual cause. Say that, rather than
    // letting it surface as a generic "something changed elsewhere".
    if (isUniqueViolation(error)) throw new ConflictError("A category with that name already exists.");
    throw error;
  }
}

export async function updateCategory(userId: string, id: string, input: { name: string; kind: CategoryDto["kind"]; color: string }) {
  const db = getDb();
  const [current] = await db.select().from(categories).where(and(eq(categories.id, id), eq(categories.userId, userId))).limit(1);
  if (!current) throw new NotFoundError("That category is gone.");
  const now = new Date();
  try {
    const [row] = await db.transaction(async (tx) => {
      const updated = await tx
        .update(categories)
        .set({ name: input.name, kind: input.kind, color: input.color, updatedAt: now })
        .where(and(eq(categories.id, id), eq(categories.userId, userId)))
        .returning();
      // Entries reference a category by name, so the rename has to carry them.
      if (current.name !== input.name) {
        await tx
          .update(transactions)
          .set({ categoryName: input.name, updatedAt: now })
          .where(and(eq(transactions.categoryName, current.name), eq(transactions.userId, userId)));
      }
      return updated;
    });
    return toCategory(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError("A category with that name already exists.");
    throw error;
  }
}

/** Removing one only works while nothing points at it. Move or delete the entries first. */
export async function deleteCategory(userId: string, id: string) {
  const db = getDb();
  const [current] = await db.select().from(categories).where(and(eq(categories.id, id), eq(categories.userId, userId))).limit(1);
  if (!current) throw new NotFoundError("That category is gone.");
  const [used] = await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.categoryName, current.name), eq(transactions.userId, userId))).limit(1);
  if (used) throw new ConflictError(`${current.name} is still used by entries. Rename it, or move those entries first.`);
  await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
}