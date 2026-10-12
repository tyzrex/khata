import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accounts, transactions } from "@/db/schema";
import { DEFAULT_ACCOUNTS } from "@/lib/constants";
import { ConflictError, NotFoundError, isUniqueViolation } from "@/server/errors";
import type { AccountDto } from "@/lib/types";

/** See `db/categories.ts`: accounts and categories are the same shape, kept apart on purpose. */

function toAccount(row: typeof accounts.$inferSelect): AccountDto {
  return { id: row.id, name: row.name, sortOrder: row.sortOrder };
}

/**
 * Give a brand-new book its starting five. Runs on the read path, so it has to
 * tell "never seeded" from "seeded and then renamed": seeding on any *missing*
 * default would resurrect a name the person deliberately changed. An empty table
 * is the only unambiguous signal, and it can only be reached by a book that has
 * never had an account — deleting is refused while entries still point at one.
 */
export async function ensureAccounts(userId: string) {
  const db = getDb();
  const [existing] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.userId, userId)).limit(1);
  if (existing) return;
  await db
    .insert(accounts)
    .values(
      DEFAULT_ACCOUNTS.map((account) => ({
        id: crypto.randomUUID(),
        userId,
        name: account.name,
        sortOrder: account.sortOrder,
      })),
    )
    .onConflictDoNothing({ target: [accounts.userId, accounts.name] });
}

export async function listAccounts(userId: string) {
  await ensureAccounts(userId);
  const rows = await getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(asc(accounts.sortOrder), asc(accounts.name));
  return rows.map(toAccount);
}

/** The names alone, for pickers and for the agent API's fuzzy account match. */
export async function listAccountNames(userId: string) {
  return (await listAccounts(userId)).map((account) => account.name);
}

export async function createAccount(userId: string, name: string) {
  await ensureAccounts(userId);
  // New accounts land at the end so the seeded order stays intact at the top.
  const [bottom] = await getDb()
    .select({ sortOrder: accounts.sortOrder })
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(desc(accounts.sortOrder))
    .limit(1);
  try {
    const [row] = await getDb()
      .insert(accounts)
      .values({ id: crypto.randomUUID(), userId, name, sortOrder: (bottom?.sortOrder ?? 0) + 10 })
      .returning();
    return toAccount(row);
  } catch (error) {
    // Two tabs saving the same new name is the usual cause.
    if (isUniqueViolation(error)) throw new ConflictError("An account with that name already exists.");
    throw error;
  }
}

export async function renameAccount(userId: string, id: string, name: string) {
  const db = getDb();
  const [current] = await db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId))).limit(1);
  if (!current) throw new NotFoundError("That account is gone.");
  const now = new Date();
  try {
    const [row] = await db.transaction(async (tx) => {
      const updated = await tx
        .update(accounts)
        .set({ name, updatedAt: now })
        .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
        .returning();
      // Entries reference an account by name, so the rename has to carry them.
      if (current.name !== name) {
        await tx
          .update(transactions)
          .set({ account: name, updatedAt: now })
          .where(and(eq(transactions.account, current.name), eq(transactions.userId, userId)));
      }
      return updated;
    });
    return toAccount(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError("An account with that name already exists.");
    throw error;
  }
}

/**
 * Removing an account only works while nothing points at it, the same rule
 * categories use. Move or delete the entries first.
 */
export async function deleteAccount(userId: string, id: string) {
  await getDb().transaction(async (tx) => {
    // FOR UPDATE: a write that is about to use this account holds it FOR SHARE (see
    // `holdNamedAccount`), so the check below either waits for that write and sees its
    // entry, or finishes first and makes the write recreate the account. Without the
    // lock, an entry could land between the check and the delete and point at nothing.
    const [current] = await tx.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId))).limit(1).for("update");
    if (!current) throw new NotFoundError("That account is gone.");
    const [used] = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.account, current.name), eq(transactions.userId, userId)))
      .limit(1);
    if (used) throw new ConflictError(`${current.name} is still used by entries. Rename it, or move those entries first.`);
    await tx.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  });
}

type Executor = Pick<ReturnType<typeof getDb>, "insert" | "select">;

/** Adds an account a write referenced but the book does not have yet. */
export async function ensureNamedAccount(userId: string, name: string, executor: Executor = getDb()) {
  await executor
    .insert(accounts)
    .values({ id: crypto.randomUUID(), userId, name, sortOrder: 200 })
    .onConflictDoNothing({ target: [accounts.userId, accounts.name] });
}

/**
 * Make sure the account exists and stay its reader until the surrounding transaction
 * ends, so `deleteAccount` cannot remove it from under the entry being written.
 * If a delete wins the race, the row is gone when the lock is granted: recreate it.
 */
export async function holdNamedAccount(userId: string, name: string, tx: Executor) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await ensureNamedAccount(userId, name, tx);
    const [row] = await tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.name, name))).limit(1).for("share");
    if (row) return;
  }
  throw new ConflictError("That account was just changed elsewhere. Try again.");
}