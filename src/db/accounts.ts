import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accounts, transactions } from "@/db/schema";
import { DEFAULT_ACCOUNTS } from "@/lib/constants";
import type { AccountDto } from "@/lib/types";

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
  const [row] = await getDb()
    .insert(accounts)
    .values({ id: crypto.randomUUID(), userId, name, sortOrder: (bottom?.sortOrder ?? 0) + 10 })
    .returning();
  return toAccount(row);
}

export async function renameAccount(userId: string, id: string, name: string) {
  const db = getDb();
  const [current] = await db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId))).limit(1);
  if (!current) return null;
  const now = new Date();
  const [row] = await db.transaction(async (tx) => {
    const updated = await tx
      .update(accounts)
      .set({ name, updatedAt: now })
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
      .returning();
    if (current.name !== name) {
      await tx
        .update(transactions)
        .set({ account: name, updatedAt: now })
        .where(and(eq(transactions.account, current.name), eq(transactions.userId, userId)));
    }
    return updated;
  });
  return row ? toAccount(row) : null;
}

/**
 * Removing an account only works while nothing points at it, the same rule
 * categories use. Move or delete the entries first.
 */
export async function deleteAccount(userId: string, id: string) {
  const db = getDb();
  const [current] = await db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId))).limit(1);
  if (!current) return { status: "missing" as const };
  const [used] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.account, current.name), eq(transactions.userId, userId)))
    .limit(1);
  if (used) return { status: "used" as const, name: current.name };
  await db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  return { status: "deleted" as const };
}

/** Rewrites `transactions.account` when a write names an account that does not exist yet. */
export async function ensureNamedAccount(userId: string, name: string) {
  const db = getDb();
  await db
    .insert(accounts)
    .values({ id: crypto.randomUUID(), userId, name, sortOrder: 200 })
    .onConflictDoNothing({ target: [accounts.userId, accounts.name] });
}