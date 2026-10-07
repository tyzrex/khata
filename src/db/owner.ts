import { isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { categories, groups, people, settlements, sharedExpenses, transactions } from "@/db/schema";

async function hasUnownedRows(db: Pick<ReturnType<typeof getDb>, "select">) {
  const [category] = await db.select({ id: categories.id }).from(categories).where(isNull(categories.userId)).limit(1);
  if (category) return true;
  const [transaction] = await db.select({ id: transactions.id }).from(transactions).where(isNull(transactions.userId)).limit(1);
  if (transaction) return true;
  const [person] = await db.select({ id: people.id }).from(people).where(isNull(people.userId)).limit(1);
  if (person) return true;
  const [group] = await db.select({ id: groups.id }).from(groups).where(isNull(groups.userId)).limit(1);
  if (group) return true;
  const [expense] = await db.select({ id: sharedExpenses.id }).from(sharedExpenses).where(isNull(sharedExpenses.userId)).limit(1);
  if (expense) return true;
  const [settlement] = await db.select({ id: settlements.id }).from(settlements).where(isNull(settlements.userId)).limit(1);
  return Boolean(settlement);
}

export async function claimUnownedLedger(userId: string) {
  const db = getDb();
  if (!(await hasUnownedRows(db))) return;

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('khata-unowned-ledger'))`);
    if (!(await hasUnownedRows(tx))) return;
    const stamp = { userId };
    await tx.update(categories).set(stamp).where(isNull(categories.userId));
    await tx.update(transactions).set(stamp).where(isNull(transactions.userId));
    await tx.update(people).set(stamp).where(isNull(people.userId));
    await tx.update(groups).set(stamp).where(isNull(groups.userId));
    await tx.update(sharedExpenses).set(stamp).where(isNull(sharedExpenses.userId));
    await tx.update(settlements).set(stamp).where(isNull(settlements.userId));
  });
}
