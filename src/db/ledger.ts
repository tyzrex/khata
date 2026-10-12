import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { ensureAccounts, holdNamedAccount } from "@/db/accounts";
import { categories, transactions, type TransactionRow } from "@/db/schema";
import { ensureCategories, holdNamedCategory } from "@/db/categories";
import { type TxType } from "@/lib/constants";
import { summarize, type LedgerAmount } from "@/lib/period";
import { parseImportPayload, type ImportTransaction, type ManualTransaction } from "@/lib/schemas";
import type { ImportResult, SummaryResponse, TransactionDto } from "@/lib/types";

export function toTransaction(row: TransactionRow): TransactionDto {
  return {
    id: row.id,
    externalId: row.externalId,
    date: row.date,
    type: row.type as TxType,
    amount: row.amount,
    currency: row.currency,
    foreignAmount: row.foreignAmount,
    fxRate: row.fxRate,
    category: row.categoryName,
    merchant: row.merchant,
    account: row.account,
    note: row.note,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type TransactionFilters = {
  q?: string;
  from?: string;
  to?: string;
  type?: TxType;
  category?: string;
  account?: string;
};

export async function listTransactions(userId: string, filters: TransactionFilters = {}) {
  await ensureCategories(userId);
  const clauses = [eq(transactions.userId, userId)];
  if (filters.from) clauses.push(gte(transactions.date, filters.from));
  if (filters.to) clauses.push(lte(transactions.date, filters.to));
  if (filters.type) clauses.push(eq(transactions.type, filters.type));
  if (filters.category) clauses.push(eq(transactions.categoryName, filters.category));
  if (filters.account) clauses.push(eq(transactions.account, filters.account));
  if (filters.q) {
    const pattern = `%${filters.q.replace(/[%_\\]/g, "")}%`;
    const search = or(
      ilike(transactions.merchant, pattern),
      ilike(transactions.note, pattern),
      ilike(transactions.account, pattern),
      ilike(transactions.categoryName, pattern),
      ilike(transactions.externalId, pattern),
    );
    if (search) clauses.push(search);
  }
  const rows = await getDb()
    .select()
    .from(transactions)
    .where(clauses.length ? and(...clauses) : undefined)
    // `id` last: rows imported in one batch share a timestamp, and without a tiebreaker their order may change between calls.
    .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id));
  return rows.map(toTransaction);
}

function transactionValues(userId: string, input: ManualTransaction | ImportTransaction, externalId: string, source: string) {
  const now = new Date();
  return {
    userId,
    externalId,
    date: input.date,
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    foreignAmount: input.foreignAmount,
    fxRate: input.fxRate,
    categoryName: input.category,
    merchant: input.merchant,
    account: input.account,
    note: input.note,
    source,
    updatedAt: now,
  };
}

/**
 * `idempotencyKey` is one per form submission. The entry's external id is derived from
 * it, and `(user, external id)` is unique, so a double-click or a retry after a dropped
 * response finds the entry the first request wrote instead of adding another.
 */
export async function createTransaction(userId: string, input: ManualTransaction, idempotencyKey?: string) {
  await ensureCategories(userId);
  const externalId = `manual-${idempotencyKey ?? crypto.randomUUID()}`;
  return getDb().transaction(async (tx) => {
    // The account and category are held until this entry is written, so deleting one of
    // them cannot slip in between and leave the entry pointing at nothing.
    await holdNamedCategory(userId, input.category, input.type, tx);
    await holdNamedAccount(userId, input.account, tx);
    const [row] = await tx
      .insert(transactions)
      .values({ id: crypto.randomUUID(), ...transactionValues(userId, input, externalId, "manual") })
      .onConflictDoNothing({ target: [transactions.userId, transactions.externalId] })
      .returning();
    if (row) return toTransaction(row);
    const [existing] = await tx
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.externalId, externalId)))
      .limit(1);
    return toTransaction(existing!);
  });
}

export async function updateTransaction(userId: string, id: string, input: ManualTransaction) {
  await ensureCategories(userId);
  const row = await getDb().transaction(async (tx) => {
    await holdNamedCategory(userId, input.category, input.type, tx);
    await holdNamedAccount(userId, input.account, tx);
    const [updated] = await tx
      .update(transactions)
      .set({
        date: input.date,
        type: input.type,
        amount: input.amount,
        currency: input.currency,
        foreignAmount: input.foreignAmount,
        fxRate: input.fxRate,
        categoryName: input.category,
        merchant: input.merchant,
        account: input.account,
        note: input.note,
        updatedAt: new Date(),
      })
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .returning();
    return updated;
  });
  if (!row) return null;
  return toTransaction(row);
}

export async function deleteTransaction(userId: string, id: string) {
  const rows = await getDb()
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning({ id: transactions.id });
  return rows.length > 0;
}

export async function importTransactions(userId: string, payload: unknown): Promise<ImportResult> {
  const { rows, invalid } = parseImportPayload(payload);
  await ensureCategories(userId);
  await ensureAccounts(userId);
  let created = 0;
  let updated = 0;
  const db = getDb();

  await db.transaction(async (tx) => {
    for (const row of rows) {
      await holdNamedAccount(userId, row.account, tx);
      await holdNamedCategory(userId, row.category, row.type, tx);

      // One statement, so two imports of the same external id (a bot retrying) cannot both
      // pass a "does it exist?" check and then collide on the unique index. In Postgres a
      // row that was just inserted has xmax = 0; one that was updated through the conflict does not.
      const values = transactionValues(userId, row, row.externalId, row.source);
      const [written] = await tx
        .insert(transactions)
        .values({ id: crypto.randomUUID(), ...values })
        .onConflictDoUpdate({ target: [transactions.userId, transactions.externalId], set: values })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      if (written?.inserted) created += 1;
      else updated += 1;
    }
  });

  return { created, updated, invalid };
}

export async function exportTransactions(userId: string) {
  const rows = await listTransactions(userId);
  return {
    transactions: rows.map((row) => ({
      externalId: row.externalId,
      date: row.date,
      type: row.type,
      amount: row.amount,
      currency: row.currency,
      foreignAmount: row.foreignAmount,
      fxRate: row.fxRate,
      category: row.category,
      merchant: row.merchant,
      account: row.account,
      note: row.note,
      source: row.source,
    })),
  };
}

export async function summarizeLedger(userId: string): Promise<SummaryResponse> {
  await ensureCategories(userId);
  const rows = await getDb().select().from(transactions).where(eq(transactions.userId, userId));
  const categoryRows = await getDb().select().from(categories).where(eq(categories.userId, userId));
  const colors = new Map(categoryRows.map((category) => [category.name, category.color]));
  const amounts: LedgerAmount[] = rows.map((row) => ({
    date: row.date,
    type: row.type as TxType,
    amount: row.amount,
    category: row.categoryName,
  }));
  const summary = summarize(amounts);
  const paint = (period: (typeof summary)["week"]) => ({
    ...period,
    byCategory: period.byCategory.map((slice) => ({
      ...slice,
      color: colors.get(slice.category) ?? "#7c828a",
    })),
  });
  return {
    ...summary,
    week: paint(summary.week),
    month: paint(summary.month),
  };
}
