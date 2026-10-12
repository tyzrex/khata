import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { listAccounts } from "@/db/accounts";
import { listTransactions, summarizeLedger } from "@/db/ledger";
import { listCategories } from "@/db/categories";
import { getShareBook, type ShareBook } from "@/db/shares";
import type { AccountDto, CategoryDto, SummaryResponse, TransactionDto } from "@/lib/types";
import { snapshotTag } from "@/server/cache-tags";

export type KhataSnapshot = {
  summary: SummaryResponse;
  accounts: AccountDto[];
  categories: CategoryDto[];
  transactions: TransactionDto[];
  book: ShareBook;
};

export type InitialData = { ok: true; data: KhataSnapshot } | { ok: false; error: string };

/**
 * The cached read.
 *
 * This used to be uncached, which meant every direct visit, every client
 * navigation, every prefetch of every one of the eleven links in the sidebar,
 * and every `router.refresh()` re-ran all five queries — including
 * `getShareBook`, which is the most expensive read in the app. With Cache
 * Components switched on and not one `use cache` scope in the project, the flag
 * was buying nothing but the warnings.
 *
 * Keyed on the account id alone, so nothing here can be asked for someone
 * else's ledger. `ledger` is a named profile in `next.config.ts` rather than an
 * inline object so the numbers are written down in one place.
 */
async function readSnapshot(userId: string): Promise<KhataSnapshot> {
  "use cache";
  cacheTag(snapshotTag(userId));
  cacheLife("ledger");

  const [summary, accounts, categories, transactions, book] = await Promise.all([
    summarizeLedger(userId),
    listAccounts(userId),
    listCategories(userId),
    listTransactions(userId),
    getShareBook(userId),
  ]);
  // Round-trip through JSON so the client sees exactly what the API routes send (dates as strings).
  return JSON.parse(JSON.stringify({ summary, accounts, categories, transactions, book })) as KhataSnapshot;
}

/**
 * Everything the signed-in screens need, read on the server while the shell
 * streams. The client used to fetch these four after hydration, which put a
 * spinner between the first paint and the numbers.
 *
 * The try/catch is deliberately outside the cached scope. A database that is
 * briefly unreachable must produce a page that offers a retry, not a cached
 * "Postgres is unreachable" that every later load would keep replaying until the
 * entry expired.
 */
export async function loadInitialData(userId: string): Promise<InitialData> {
  try {
    return { ok: true, data: await readSnapshot(userId) };
  } catch (error) {
    console.error(error);
    return { ok: false, error: process.env.NODE_ENV === "production" ? "Khata is unavailable right now. Try again shortly." : "Postgres is unreachable, or the Khata tables are missing. Check DATABASE_URL and run bun run db:migrate." };
  }
}