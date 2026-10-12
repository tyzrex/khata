"use client";

import { queryOptions } from "@tanstack/react-query";
import { requestJson } from "@/lib/api-client";
import { IDEMPOTENCY_HEADER, submitOnce } from "@/lib/submit-once";
import type { AccountDto, CategoryDto, ImportResult, SummaryResponse, TransactionDto } from "@/lib/types";

/**
 * The personal ledger's cache contract.
 *
 * Four resources with four lifetimes, kept apart so a write can invalidate only what it
 * actually changed. The previous hook re-read all four after every write, so saving a
 * transaction also refetched the account list and the categories.
 *
 * Every query is seeded from the server render (see `loadInitialData`), so the numbers are
 * already on screen before React Query exists. `staleTime` is what keeps it from immediately
 * refetching that same data over the top of it.
 */

export const summaryKey = ["summary"] as const;
export const accountsKey = ["accounts"] as const;
export const categoriesKey = ["categories"] as const;
export const transactionsKey = ["transactions"] as const;

/**
 * The layout waits on the server for these, so anything that invalidates them is rare and
 * deliberate. A long `staleTime` is safe because a write invalidates directly rather than
 * waiting for a background refetch to notice.
 */
export const summaryQuery = queryOptions({
  queryKey: summaryKey,
  queryFn: () => requestJson<SummaryResponse>("/api/summary"),
  staleTime: 60_000,
});

export const accountsQuery = queryOptions({
  queryKey: accountsKey,
  queryFn: () => requestJson<{ accounts: AccountDto[] }>("/api/accounts").then((body) => body.accounts),
  staleTime: 60_000,
});

export const categoriesQuery = queryOptions({
  queryKey: categoriesKey,
  queryFn: () => requestJson<{ categories: CategoryDto[] }>("/api/categories").then((body) => body.categories),
  staleTime: 60_000,
});

/**
 * The whole ledger, held once. The ledger page filters this on the client from the URL and the
 * dashboard reads it whole, so a paginated read here would mean two shapes for one resource.
 */
export const transactionsQuery = queryOptions({
  queryKey: transactionsKey,
  queryFn: () => requestJson<{ transactions: TransactionDto[] }>("/api/transactions").then((body) => body.transactions),
  staleTime: 30_000,
});

type AccountsResponse = { accounts: AccountDto[] };
type CategoriesResponse = { categories: CategoryDto[] };
type TransactionsResponse = { transactions: TransactionDto[] };

export function postTransaction(input: unknown, id?: string) {
  if (id) return requestJson<unknown>(`/api/transactions/${id}`, { method: "PATCH", json: input });
  return submitOnce("transaction", input, (key) => requestJson<unknown>("/api/transactions", { method: "POST", json: input, headers: { [IDEMPOTENCY_HEADER]: key } }));
}

export function deleteTransaction(id: string) {
  return requestJson<void>(`/api/transactions/${id}`, { method: "DELETE" });
}

export function postCategory(input: unknown, id?: string) {
  return requestJson<unknown>(id ? `/api/categories/${id}` : "/api/categories", { method: id ? "PATCH" : "POST", json: input });
}

export function deleteCategory(id: string) {
  return requestJson<void>(`/api/categories/${id}`, { method: "DELETE" });
}

export function postAccount(name: string, id?: string) {
  return requestJson<AccountsResponse>(id ? `/api/accounts/${id}` : "/api/accounts", { method: id ? "PATCH" : "POST", json: { name } });
}

export function deleteAccount(id: string) {
  return requestJson<AccountsResponse>(`/api/accounts/${id}`, { method: "DELETE" });
}

/**
 * A bad import answers 400 with a per-row report rather than an error, so the caller's own
 * status handling decides; `requestJson` throws it and the dialog reads it back off `error`.
 */
export function postImport(payload: unknown) {
  return requestJson<ImportResult>("/api/import", { method: "POST", json: payload });
}

export function postSeed() {
  return requestJson<ImportResult>("/api/seed", { method: "POST" });
}

/** The four lists move together whenever a write touches more than one of them. */
export const ledgerKeys = [summaryKey, accountsKey, categoriesKey, transactionsKey] as const;
export type { AccountsResponse, CategoriesResponse, TransactionsResponse };