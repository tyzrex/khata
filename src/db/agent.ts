import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { toTransaction } from "@/db/ledger";
import { transactions, user } from "@/db/schema";

/** Small lookups the agent API needs on top of the ledger module. */

export async function getTransaction(userId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.id, id)))
    .limit(1);
  return row ? toTransaction(row) : null;
}

export async function transactionsByExternalId(userId: string, externalIds: string[]) {
  if (!externalIds.length) return [];
  const rows = await getDb()
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, userId), inArray(transactions.externalId, externalIds)));
  return rows.map(toTransaction);
}

/** Name and email of the account, so "Sulav" can mean the caller and replies can greet them. */
export async function accountOf(userId: string) {
  const [row] = await getDb().select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId)).limit(1);
  return row ?? { name: "", email: "" };
}
