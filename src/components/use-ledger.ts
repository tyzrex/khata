"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { AccountDto, CategoryDto, ImportResult, SummaryResponse, TransactionDto } from "@/lib/types";

async function readError(response: Response, goToLogin: () => void) {
  if (response.status === 401) {
    goToLogin();
    throw new Error("Sign in required.");
  }
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? "The ledger could not be read just now.");
}

/**
 * The bank and cash ledger, seeded from the server render. Every transaction is held
 * once; the ledger page filters it on the client from the URL, and the dashboard
 * reads it whole. Writes go to the API and then re-read the three lists together.
 */
export function useLedger(initial: { summary: SummaryResponse; accounts: AccountDto[]; categories: CategoryDto[]; transactions: TransactionDto[] }) {
  const router = useRouter();
  const deny = useCallback((response: Response) => readError(response, () => router.push("/login")), [router]);
  const [summary, setSummary] = useState<SummaryResponse>(initial.summary);
  const [transactions, setTransactions] = useState<TransactionDto[]>(initial.transactions);
  const [accounts, setAccounts] = useState<AccountDto[]>(initial.accounts);
  const [categories, setCategories] = useState<CategoryDto[]>(initial.categories);

  const refresh = useCallback(async () => {
    const [summaryRes, accountRes, categoryRes, txRes] = await Promise.all([fetch("/api/summary"), fetch("/api/accounts"), fetch("/api/categories"), fetch("/api/transactions")]);
    if (!summaryRes.ok) await deny(summaryRes);
    if (!accountRes.ok) await deny(accountRes);
    if (!categoryRes.ok) await deny(categoryRes);
    if (!txRes.ok) await deny(txRes);
    setSummary((await summaryRes.json()) as SummaryResponse);
    setAccounts(((await accountRes.json()) as { accounts: AccountDto[] }).accounts);
    setCategories(((await categoryRes.json()) as { categories: CategoryDto[] }).categories);
    setTransactions(((await txRes.json()) as { transactions: TransactionDto[] }).transactions);
  }, [deny]);

  async function write(path: string, method: string, payload?: unknown) {
    const response = await fetch(path, {
      method,
      headers: payload === undefined ? undefined : { "content-type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    if (!response.ok && response.status !== 204) await deny(response);
    await refresh();
    return response;
  }

  async function saveTransaction(input: unknown, id?: string) {
    await write(id ? `/api/transactions/${id}` : "/api/transactions", id ? "PATCH" : "POST", input);
  }

  async function removeTransaction(id: string) {
    await write(`/api/transactions/${id}`, "DELETE");
  }

  async function saveCategory(input: unknown, id?: string) {
    await write(id ? `/api/categories/${id}` : "/api/categories", id ? "PATCH" : "POST", input);
  }

  async function removeCategory(id: string) {
    await write(`/api/categories/${id}`, "DELETE");
  }

  async function saveAccount(name: string, id?: string) {
    await write(id ? `/api/accounts/${id}` : "/api/accounts", id ? "PATCH" : "POST", { name });
  }

  async function removeAccount(id: string) {
    await write(`/api/accounts/${id}`, "DELETE");
  }

  async function importPayload(payload: unknown): Promise<ImportResult> {
    const response = await fetch("/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as ImportResult & { error?: string };
    if (!response.ok && response.status !== 400) await deny(response);
    await refresh();
    return body;
  }

  async function loadSample(): Promise<ImportResult> {
    const response = await fetch("/api/seed", { method: "POST" });
    if (!response.ok) await deny(response);
    const body = (await response.json()) as ImportResult;
    await refresh();
    return body;
  }

  return {
    summary,
    transactions,
    accounts,
    categories,
    reload: refresh,
    saveTransaction,
    removeTransaction,
    saveCategory,
    removeCategory,
    saveAccount,
    removeAccount,
    importPayload,
    loadSample,
  };
}
