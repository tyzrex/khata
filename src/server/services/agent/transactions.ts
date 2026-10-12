import { listAccountNames } from "@/db/accounts";
import { getTransaction, transactionsByExternalId } from "@/db/agent";
import { createTransaction, deleteTransaction, importTransactions, listTransactions, updateTransaction, type TransactionFilters } from "@/db/ledger";
import { listCategories } from "@/db/categories";
import { listOfRows, toLedgerRow } from "@/server/agent/ledger-input";
import { AgentInputError, resolveAccount, resolveCategory } from "@/server/agent/match";
import { transactionInput, transactionPatch } from "@/server/agent/schemas";
import { transactionSentence, transactionTotals } from "@/server/agent/views";
import { todayInKathmandu } from "@/lib/period";
import { manualTransactionSchema } from "@/lib/schemas";
import type { TransactionDto } from "@/lib/types";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { Rendered } from "@/server/services/agent/balances";
import type { z } from "zod";

/**
 * Bank lines, addressed loosely.
 *
 * Amounts may arrive as "1,200" or "Rs 1200", dates as "yesterday", and a batch
 * may mix rows that save with rows that cannot — so one bad row does not lose the
 * other nine. `invalid` comes back in the reply so a bot can correct and resend
 * just those.
 *
 * Rows carrying an `externalId` are upserted through the import path, which makes
 * a retried message idempotent instead of duplicating the expense.
 */

/** Most rows one request may send. Larger backfills go through /api/import. */
const MAX_ROWS = 100;

const MISSING = "No transaction with that id. List them with GET /api/v1/transactions.";

export type TransactionQuery = { limit: number } & TransactionFilters;
export type TransactionDraft = z.infer<ReturnType<typeof transactionInput>>;

export async function listEntries(userId: string, query: TransactionQuery): Promise<Rendered<unknown>> {
  const { limit, ...filters } = query;
  const all = await listTransactions(userId, filters);
  const totals = transactionTotals(all);
  const rows = all.slice(0, limit);
  const shown = rows.length < all.length ? ` Showing the newest ${rows.length}.` : "";
  return {
    data: { transactions: rows, totals, truncated: rows.length < all.length },
    message: `${totals.count} ${totals.count === 1 ? "transaction" : "transactions"}: spent NPR ${totals.spent.toLocaleString("en-IN")}, credited NPR ${totals.credited.toLocaleString("en-IN")}.${shown}`,
  };
}

export async function readEntry(userId: string, id: string): Promise<Rendered<{ transaction: TransactionDto }>> {
  const row = await getTransaction(userId, id);
  if (!row) throw new NotFoundError(MISSING);
  return { data: { transaction: row }, message: `${transactionSentence(row)}.` };
}

type RowProblem = { index: number; error: string; candidates?: string[] };

export async function saveEntries(userId: string, payload: unknown): Promise<Rendered<unknown>> {
  const { rows, single } = listOfRows(payload);
  if (rows.length === 0) throw new ValidationError("Send at least one transaction.");
  if (rows.length > MAX_ROWS) throw new ValidationError(`Send at most ${MAX_ROWS} transactions per request.`);

  const schema = transactionInput(todayInKathmandu());
  const [categories, accounts] = await Promise.all([listCategories(userId), listAccountNames(userId)]);
  const categoryNames = categories.map((category) => category.name);

  const invalid: RowProblem[] = [];
  const ready: { index: number; row: ReturnType<typeof toLedgerRow> }[] = [];
  rows.forEach((raw, index) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      invalid.push({ index, error: parsed.error.issues[0]?.message ?? "Invalid transaction" });
      return;
    }
    try {
      ready.push({ index, row: toLedgerRow(parsed.data, categoryNames, accounts) });
    } catch (error) {
      if (!(error instanceof AgentInputError)) throw error;
      invalid.push({ index, error: error.message, ...(error.candidates.length ? { candidates: error.candidates } : {}) });
    }
  });

  // A single row that failed has no partial success to report, so its problem is the answer.
  if (single && invalid[0]) {
    const { error, candidates } = invalid[0];
    throw candidates?.length ? new AgentInputError(error, candidates) : new ValidationError(error);
  }
  if (!ready.length) throw new ValidationError("None of those transactions could be saved.", invalid);

  const keyed = ready.filter((item) => item.row.externalId);
  const saved: TransactionDto[] = [];
  let created = 0;
  let updated = 0;
  if (keyed.length) {
    const result = await importTransactions(userId, {
      transactions: keyed.map(({ row }) => ({ ...row, externalId: row.externalId!, source: "agent" })),
    });
    created = result.created;
    updated = result.updated;
    saved.push(...(await transactionsByExternalId(userId, keyed.map((item) => item.row.externalId!))));
  }
  for (const { row } of ready.filter((item) => !item.row.externalId)) {
    saved.push(await createTransaction(userId, row));
    created += 1;
  }

  return {
    data: { transactions: saved, created, updated, invalid },
    message: single && saved[0]
      ? `${updated ? "Updated" : "Saved"}: ${transactionSentence(saved[0])}.`
      : `Saved ${saved.length} ${saved.length === 1 ? "transaction" : "transactions"} (${created} new, ${updated} updated)${invalid.length ? `; ${invalid.length} skipped` : ""}.`,
    status: 201,
  };
}

/** Change only the fields sent; the rest keep their current values. */
export async function editEntry(userId: string, id: string, payload: unknown): Promise<Rendered<{ transaction: TransactionDto }>> {
  const patch = transactionPatch(todayInKathmandu()).parse(payload);
  const current = await getTransaction(userId, id);
  if (!current) throw new NotFoundError(MISSING);

  const type = patch.type ?? current.type;
  // A foreign-currency entry's NPR amount is foreignAmount x fxRate, recomputed on every save. An
  // `amount` sent alongside would be overwritten without a word, and the reply would still say
  // "Updated". Refuse it and say which field actually moves the number.
  const currency = patch.currency ?? current.currency;
  if (patch.amount !== undefined && currency !== "NPR") {
    throw new ValidationError(`This entry is in ${currency}, so its NPR amount is foreignAmount x fxRate. Send "foreignAmount" (and "fxRate" if the rate changed) instead of "amount", or set "currency" to NPR.`);
  }
  const [categories, accounts] = await Promise.all([listCategories(userId), listAccountNames(userId)]);
  // The three currency fields travel together. A patch may change the amount, the
  // rate, or the currency itself; anything it leaves out keeps the row's current
  // value, so a rate-only edit recomputes the NPR amount instead of inventing one.
  const merged = manualTransactionSchema.safeParse({
    date: patch.date ?? current.date,
    type,
    amount: patch.amount ?? current.amount,
    currency: patch.currency ?? current.currency,
    foreignAmount: patch.foreignAmount ?? current.foreignAmount ?? undefined,
    fxRate: patch.fxRate ?? current.fxRate ?? undefined,
    category: patch.category ? resolveCategory(patch.category, type, categories.map((category) => category.name)) : current.category,
    merchant: patch.merchant ?? patch.description ?? current.merchant,
    account: patch.account ? resolveAccount(patch.account, accounts) : current.account,
    note: patch.note ?? current.note,
  });
  if (!merged.success) throw new ValidationError(merged.error.issues[0]?.message ?? "Invalid transaction");

  const row = await updateTransaction(userId, id, merged.data);
  if (!row) throw new NotFoundError(MISSING);
  return { data: { transaction: row }, message: `Updated: ${transactionSentence(row)}.` };
}

export async function deleteEntry(userId: string, id: string): Promise<Rendered<{ id: string }>> {
  const current = await getTransaction(userId, id);
  if (!current || !(await deleteTransaction(userId, id))) throw new NotFoundError(MISSING);
  return { data: { id }, message: `Deleted: ${transactionSentence(current)}.` };
}

