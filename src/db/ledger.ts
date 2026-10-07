import { and, asc, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { categories, transactions, type TransactionRow } from "@/db/schema";
import { DEFAULT_CATEGORIES, type TxType } from "@/lib/constants";
import { summarize, type LedgerAmount } from "@/lib/period";
import { parseImportPayload, type ImportTransaction, type ManualTransaction } from "@/lib/schemas";
import type { CategoryDto, ImportResult, SummaryResponse, TransactionDto } from "@/lib/types";

function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return pgCode(error.cause);
  return undefined;
}

export function isUniqueViolation(error: unknown) {
  return pgCode(error) === "23505";
}

function toTransaction(row: TransactionRow): TransactionDto {
  return {
    id: row.id,
    externalId: row.externalId,
    date: row.date,
    type: row.type as TxType,
    amount: row.amount,
    currency: "NPR",
    category: row.categoryName,
    merchant: row.merchant,
    account: row.account,
    note: row.note,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toCategory(row: typeof categories.$inferSelect): CategoryDto {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as CategoryDto["kind"],
    color: row.color,
    sortOrder: row.sortOrder,
  };
}

export async function ensureCategories(userId: string) {
  const db = getDb();
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

async function ensureNamedCategory(userId: string, name: string, kind: string) {
  const db = getDb();
  const match = DEFAULT_CATEGORIES.find((category) => category.name === name);
  await db
    .insert(categories)
    .values({
      id: crypto.randomUUID(),
      userId,
      name,
      kind: match?.kind ?? kind,
      color: match?.color ?? "#6f675e",
      sortOrder: match?.sortOrder ?? 200,
    })
    .onConflictDoNothing({ target: [categories.userId, categories.name] });
}

export async function listCategories(userId: string) {
  await ensureCategories(userId);
  const rows = await getDb()
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return rows.map(toCategory);
}

export async function createCategory(userId: string, input: { name: string; kind: CategoryDto["kind"]; color: string }) {
  await ensureCategories(userId);
  const [row] = await getDb()
    .insert(categories)
    .values({
      id: crypto.randomUUID(),
      userId,
      name: input.name,
      kind: input.kind,
      color: input.color,
      sortOrder: 200,
    })
    .returning();
  return toCategory(row);
}

export async function updateCategory(userId: string, id: string, input: { name: string; kind: CategoryDto["kind"]; color: string }) {
  const db = getDb();
  const [current] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .limit(1);
  if (!current) return null;
  const now = new Date();
  const [row] = await db.transaction(async (tx) => {
    const updated = await tx
      .update(categories)
      .set({ name: input.name, kind: input.kind, color: input.color, updatedAt: now })
      .where(and(eq(categories.id, id), eq(categories.userId, userId)))
      .returning();
    if (current.name !== input.name) {
      await tx
        .update(transactions)
        .set({ categoryName: input.name, updatedAt: now })
        .where(and(eq(transactions.categoryName, current.name), eq(transactions.userId, userId)));
    }
    return updated;
  });
  return row ? toCategory(row) : null;
}

export async function deleteCategory(userId: string, id: string) {
  const db = getDb();
  const [current] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .limit(1);
  if (!current) return { status: "missing" as const };
  const [used] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.categoryName, current.name), eq(transactions.userId, userId)))
    .limit(1);
  if (used) return { status: "used" as const, name: current.name };
  await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
  return { status: "deleted" as const };
}

export type TransactionFilters = {
  q?: string;
  from?: string;
  to?: string;
  type?: TxType;
  category?: string;
};

export async function listTransactions(userId: string, filters: TransactionFilters = {}) {
  await ensureCategories(userId);
  const clauses = [eq(transactions.userId, userId)];
  if (filters.from) clauses.push(gte(transactions.date, filters.from));
  if (filters.to) clauses.push(lte(transactions.date, filters.to));
  if (filters.type) clauses.push(eq(transactions.type, filters.type));
  if (filters.category) clauses.push(eq(transactions.categoryName, filters.category));
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
    currency: "NPR" as const,
    categoryName: input.category,
    merchant: input.merchant,
    account: input.account,
    note: input.note,
    source,
    updatedAt: now,
  };
}

export async function createTransaction(userId: string, input: ManualTransaction) {
  await ensureNamedCategory(userId, input.category, input.type);
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
  await ensureNamedCategory(userId, input.category, input.type);
  const [row] = await getDb()
    .update(transactions)
    .set({
      date: input.date,
      type: input.type,
      amount: input.amount,
      currency: "NPR",
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
  let created = 0;
  let updated = 0;
  const db = getDb();

  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx
        .insert(categories)
        .values({
          id: crypto.randomUUID(),
          userId,
          name: row.category,
          kind: row.type === "expense" ? "expense" : row.type === "income" ? "income" : "transfer",
          color: DEFAULT_CATEGORIES.find((category) => category.name === row.category)?.color ?? "#6f675e",
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
      currency: "NPR" as const,
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
      color: colors.get(slice.category) ?? "#6f675e",
    })),
  });
  return {
    ...summary,
    week: paint(summary.week),
    month: paint(summary.month),
  };
}
