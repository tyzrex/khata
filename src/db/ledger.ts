import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { ensureAccounts, ensureNamedAccount } from "@/db/accounts";
import { accounts, categories, transactions, type TransactionRow } from "@/db/schema";
import { ensureCategories, ensureNamedCategory } from "@/db/categories";
import { DEFAULT_CATEGORIES, type TxType } from "@/lib/constants";
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
    .orderBy(desc(transactions.date), desc(transactions.createdAt));
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

export async function createTransaction(userId: string, input: ManualTransaction) {
  await ensureCategories(userId);
  await ensureNamedCategory(userId, input.category, input.type);
  await ensureNamedAccount(userId, input.account);
  const [row] = await getDb()
    .insert(transactions)
    .values({
      id: crypto.randomUUID(),
      ...transactionValues(userId, input, `manual-${crypto.randomUUID()}`, "manual"),
    })
    .returning();
  return toTransaction(row);
}

export async function updateTransaction(userId: string, id: string, input: ManualTransaction) {
  await ensureCategories(userId);
  await ensureNamedCategory(userId, input.category, input.type);
  await ensureNamedAccount(userId, input.account);
  const [row] = await getDb()
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
      await tx
        .insert(accounts)
        .values({
          id: crypto.randomUUID(),
          userId,
          name: row.account,
          sortOrder: 200,
        })
        .onConflictDoNothing({ target: [accounts.userId, accounts.name] });

      await tx
        .insert(categories)
        .values({
          id: crypto.randomUUID(),
          userId,
          name: row.category,
          kind: row.type === "expense" ? "expense" : row.type === "income" ? "income" : "transfer",
          color: DEFAULT_CATEGORIES.find((category) => category.name === row.category)?.color ?? "#7c828a",
          sortOrder: DEFAULT_CATEGORIES.find((category) => category.name === row.category)?.sortOrder ?? 200,
        })
        .onConflictDoNothing({ target: [categories.userId, categories.name] });

      const [existing] = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), eq(transactions.externalId, row.externalId)))
        .limit(1);

      if (existing) {
        await tx
          .update(transactions)
          .set(transactionValues(userId, row, row.externalId, row.source))
          .where(and(eq(transactions.id, existing.id), eq(transactions.userId, userId)));
        updated += 1;
      } else {
        await tx.insert(transactions).values({
          id: crypto.randomUUID(),
          ...transactionValues(userId, row, row.externalId, row.source),
        });
        created += 1;
      }
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
