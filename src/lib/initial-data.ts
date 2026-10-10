import "server-only";
import { listAccounts } from "@/db/accounts";
import { listCategories, listTransactions, summarizeLedger } from "@/db/ledger";
import { getShareBook, type ShareBook } from "@/db/shares";
import type { AccountDto, CategoryDto, SummaryResponse, TransactionDto } from "@/lib/types";

export type KhataSnapshot = {
  summary: SummaryResponse;
  accounts: AccountDto[];
  categories: CategoryDto[];
  transactions: TransactionDto[];
  book: ShareBook;
};

export type InitialData = { ok: true; data: KhataSnapshot } | { ok: false; error: string };

/**
 * Everything the signed-in screens need, read in parallel on the server while the
 * shell streams. The client used to fetch these four after hydration, which put a
 * spinner between the first paint and the numbers.
 */
export async function loadInitialData(userId: string): Promise<InitialData> {
  try {
    const [summary, accounts, categories, transactions, book] = await Promise.all([
      summarizeLedger(userId),
      listAccounts(userId),
      listCategories(userId),
      listTransactions(userId),
      getShareBook(userId),
    ]);
    // Round-trip through JSON so the client sees exactly what the API routes send (dates as strings).
    return { ok: true, data: JSON.parse(JSON.stringify({ summary, accounts, categories, transactions, book })) as KhataSnapshot };
  } catch (error) {
    console.error(error);
    return { ok: false, error: process.env.NODE_ENV === "production" ? "Khata is unavailable right now. Try again shortly." : "Postgres is unreachable, or the Khata tables are missing. Check DATABASE_URL and run bun run db:migrate." };
  }
}
