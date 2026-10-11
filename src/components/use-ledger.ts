"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { ApiError } from "@/lib/api-client";
import type { AccountDto, CategoryDto, ImportResult, SummaryResponse, TransactionDto } from "@/lib/types";
import {
  accountsQuery,
  categoriesQuery,
  deleteAccount,
  deleteCategory,
  deleteTransaction,
  postAccount,
  postCategory,
  postImport,
  postSeed,
  postTransaction,
  summaryQuery,
  transactionsQuery,
  type AccountsResponse,
} from "@/components/ledger-query";

/** Writes answer 401 through the same path as reads, so the sign-out check is shared. */
function isSignedOut(error: unknown) {
  return (error as { status?: number } | null)?.status === 401;
}

/**
 * The bank and cash ledger, seeded from the server render and then owned by React Query.
 *
 * Reads are `useQuery` and writes are `useMutation` that invalidate the keys they affect,
 * rather than the old hook holding four `useState` copies and re-reading all four after every
 * write. The shape returned here is unchanged, so the dashboard, ledger, dialogs and sync
 * screen are untouched by this.
 */
export function useLedger(initial: { summary: SummaryResponse; accounts: AccountDto[]; categories: CategoryDto[]; transactions: TransactionDto[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const summary = useQuery({ ...summaryQuery, initialData: initial.summary });
  const accounts = useQuery({ ...accountsQuery, initialData: initial.accounts });
  const categories = useQuery({ ...categoriesQuery, initialData: initial.categories });
  const transactions = useQuery({ ...transactionsQuery, initialData: initial.transactions });

  const refresh = useCallback(async () => {
    await Promise.all([summary.refetch(), accounts.refetch(), categories.refetch(), transactions.refetch()]);
  }, [summary, accounts, categories, transactions]);

  // The session can end underneath an open tab (signed out in another tab, revoked session).
  // Every query would otherwise sit in a permanent error state behind a blank screen.
  const signedOut = isSignedOut(summary.error) || isSignedOut(accounts.error) || isSignedOut(categories.error) || isSignedOut(transactions.error);
  useEffect(() => {
    if (signedOut) router.push("/login");
  }, [signedOut, router]);

  const saveTransactionMutation = useMutation({
    mutationFn: ({ input, id }: { input: unknown; id?: string }) => postTransaction(input, id),
    // A transaction moves the balance figures and the ledger list, and nothing else.
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: summaryQuery.queryKey }), queryClient.invalidateQueries({ queryKey: transactionsQuery.queryKey })]);
    },
  });

  const removeTransactionMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: summaryQuery.queryKey }), queryClient.invalidateQueries({ queryKey: transactionsQuery.queryKey })]);
    },
  });

  const saveCategoryMutation = useMutation({
    mutationFn: ({ input, id }: { input: unknown; id?: string }) => postCategory(input, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: categoriesQuery.queryKey });
    },
  });

  const removeCategoryMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: categoriesQuery.queryKey });
    },
  });

  const saveAccountMutation = useMutation({
    mutationFn: ({ name, id }: { name: string; id?: string }) => postAccount(name, id),
    onSuccess: async (_result: AccountsResponse) => {
      // The API returns the fresh list, so the cache can take it instead of refetching.
      queryClient.setQueryData<AccountDto[]>(accountsQuery.queryKey, _result.accounts);
    },
  });

  const removeAccountMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async (_result: AccountsResponse) => {
      queryClient.setQueryData<AccountDto[]>(accountsQuery.queryKey, _result.accounts);
      // Removing an account rewrites what its transactions sum to.
      await Promise.all([queryClient.invalidateQueries({ queryKey: summaryQuery.queryKey }), queryClient.invalidateQueries({ queryKey: transactionsQuery.queryKey })]);
    },
  });

  const importMutation = useMutation({
    mutationFn: postImport,
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: summaryQuery.queryKey }), queryClient.invalidateQueries({ queryKey: transactionsQuery.queryKey })]);
    },
  });

  const seedMutation = useMutation({
    mutationFn: postSeed,
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: summaryQuery.queryKey }), queryClient.invalidateQueries({ queryKey: transactionsQuery.queryKey })]);
    },
  });

  async function saveTransaction(input: unknown, id?: string) {
    await saveTransactionMutation.mutateAsync({ input, id });
  }

  async function removeTransaction(id: string) {
    await removeTransactionMutation.mutateAsync(id);
  }

  async function saveCategory(input: unknown, id?: string) {
    await saveCategoryMutation.mutateAsync({ input, id });
  }

  async function removeCategory(id: string) {
    await removeCategoryMutation.mutateAsync(id);
  }

  async function saveAccount(name: string, id?: string) {
    await saveAccountMutation.mutateAsync({ name, id });
  }

  async function removeAccount(id: string) {
    await removeAccountMutation.mutateAsync(id);
  }

  /**
   * The import route answers 400 with a per-row report instead of an error, so that body is
   * the answer rather than a failure: `requestJson` throws it, and the dialog renders the rows
   * it refused off `ApiError.body`.
   */
  async function importPayload(payload: unknown): Promise<ImportResult> {
    try {
      return await importMutation.mutateAsync(payload);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 400) {
        const report = caught.body as ImportResult | null;
        if (report) return report;
      }
      throw caught;
    }
  }

  async function loadSample(): Promise<ImportResult> {
    return seedMutation.mutateAsync();
  }

  return {
    summary: summary.data,
    transactions: transactions.data,
    accounts: accounts.data,
    categories: categories.data,
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