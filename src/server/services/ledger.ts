import { createTransaction, deleteTransaction, exportTransactions, importTransactions, listTransactions, summarizeLedger, updateTransaction, type TransactionFilters } from "@/db/ledger";
import { seedSampleBook } from "@/db/shares";
import { readSampleWeek } from "@/lib/sample-week";
import { ReportError } from "@/server/http";
import type { ImportResult, SummaryResponse, TransactionDto } from "@/lib/types";
import type { ManualTransaction } from "@/lib/schemas";

/**
 * The private ledger: bank lines, summaries, import and export.
 *
 * `importLedger` owns the one policy a route used to re-derive from the result
 * shape — a file where nothing was readable is a 400, while a file where some
 * rows were readable is a success that reports what it dropped. Writing that in a
 * route meant each importer had to remember which of the two it was doing.
 */

export { listTransactions, summarizeLedger, createTransaction, deleteTransaction, exportTransactions };
export type { TransactionFilters, SummaryResponse, TransactionDto };

export async function editEntry(userId: string, id: string, input: ManualTransaction) {
  return updateTransaction(userId, id, input);
}

/**
 * A wholly unreadable file is a client mistake worth reporting as one; a partly
 * readable file is a success that lists what it dropped, because re-sending the
 * good rows would have worked and should not be made to look like a failure.
 */
export async function importLedger(userId: string, payload: unknown): Promise<ImportResult> {
  const result = await importTransactions(userId, payload);
  if (result.created === 0 && result.updated === 0 && result.invalid.length > 0) {
    throw new ReportError("No rows could be imported.", result);
  }
  return result;
}

/** The demo book: a week of bank lines plus a small shared group, for an empty ledger. */
export async function seedSampleData(userId: string) {
  const transactions = await importTransactions(userId, readSampleWeek());
  await seedSampleBook(userId);
  return { ...transactions, shares: "seeded" as const };
}