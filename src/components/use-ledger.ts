"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { TxType } from "@/lib/constants";
import type { CategoryDto, ImportResult, SummaryResponse, TransactionDto } from "@/lib/types";

export type LedgerFilters = {
  q: string;
  from: string;
  to: string;
  type: "" | TxType;
  category: string;
};

const emptyFilters: LedgerFilters = { q: "", from: "", to: "", type: "", category: "" };

async function readError(response: Response, goToLogin: () => void) {
  if (response.status === 401) {
    goToLogin();
    throw new Error("Sign in required.");
  }
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? "The ledger could not be read just now.");
}

export function useLedger() {
  const router = useRouter();
  const deny = useCallback((response: Response) => readError(response, () => router.push("/login")), [router]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [transactions, setTransactions] = useState<TransactionDto[]>([]);
  /** Every transaction, never filtered. The dashboard reads this. */
  const [allTransactions, setAllTransactions] = useState<TransactionDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [filters, setFilters] = useState<LedgerFilters>(emptyFilters);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [listPending, setListPending] = useState(false);

  const loadTransactions = useCallback(async (next: LedgerFilters) => {
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    if (next.type) params.set("type", next.type);
    if (next.category) params.set("category", next.category);
    const response = await fetch(`/api/transactions?${params.toString()}`);
    if (!response.ok) await deny(response);
    const body = (await response.json()) as { transactions: TransactionDto[] };
    setTransactions(body.transactions);
  }, [deny]);

  const refresh = useCallback(async () => {
    const [summaryRes, categoryRes] = await Promise.all([fetch("/api/summary"), fetch("/api/categories")]);
    if (!summaryRes.ok) await deny(summaryRes);
    if (!categoryRes.ok) await deny(categoryRes);
    const summaryBody = (await summaryRes.json()) as SummaryResponse;
    const categoryBody = (await categoryRes.json()) as { categories: CategoryDto[] };
    setSummary(summaryBody);
    setCategories(categoryBody.categories);
    const everything = await fetch("/api/transactions");
    if (!everything.ok) await deny(everything);
    setAllTransactions(((await everything.json()) as { transactions: TransactionDto[] }).transactions);
    await loadTransactions(filters);
  }, [deny, filters, loadTransactions]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          throw new Error("You're offline. Khata can open, but the ledger lives in Postgres and needs a connection.");
        }
        const [summaryRes, categoryRes, txRes] = await Promise.all([
          fetch("/api/summary"),
          fetch("/api/categories"),
          fetch("/api/transactions"),
        ]);
        if (!summaryRes.ok) await deny(summaryRes);
        if (!categoryRes.ok) await deny(categoryRes);
        if (!txRes.ok) await deny(txRes);
        const summaryBody = (await summaryRes.json()) as SummaryResponse;
        const categoryBody = (await categoryRes.json()) as { categories: CategoryDto[] };
        const txBody = (await txRes.json()) as { transactions: TransactionDto[] };
        if (cancelled) return;
        setSummary(summaryBody);
        setCategories(categoryBody.categories);
        setTransactions(txBody.transactions);
        setAllTransactions(txBody.transactions);
        setStatus("ready");
      } catch (caught) {
        if (cancelled) return;
        setStatus("error");
        setError(caught instanceof Error ? caught.message : "The ledger could not be opened.");
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [deny]);

  async function applyFilters(next: LedgerFilters) {
    setFilters(next);
    setListPending(true);
    try {
      await loadTransactions(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The list could not be filtered.");
    } finally {
      setListPending(false);
    }
  }

  async function reload() {
    setStatus("loading");
    setError(null);
    try {
      await refresh();
      setStatus("ready");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "The ledger could not be opened.");
    }
  }

  async function saveTransaction(input: unknown, id?: string) {
    const response = await fetch(id ? `/api/transactions/${id}` : "/api/transactions", {
      method: id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) await deny(response);
    await refresh();
  }

  async function removeTransaction(id: string) {
    const response = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    if (!response.ok && response.status !== 204) await deny(response);
    await refresh();
  }

  async function saveCategory(input: unknown, id?: string) {
    const response = await fetch(id ? `/api/categories/${id}` : "/api/categories", {
      method: id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) await deny(response);
    await refresh();
  }

  async function removeCategory(id: string) {
    const response = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    if (!response.ok && response.status !== 204) await deny(response);
    await refresh();
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
    allTransactions,
    categories,
    filters,
    status,
    error,
    listPending,
    applyFilters,
    reload,
    saveTransaction,
    removeTransaction,
    saveCategory,
    removeCategory,
    importPayload,
    loadSample,
    emptyFilters,
  };
}
