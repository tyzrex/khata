"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, use, useContext, useEffect, useState, type ReactNode } from "react";
import { useFrame } from "@/components/app-frame";
import { accountsKey, categoriesKey, summaryKey, transactionsKey } from "@/components/ledger-query";
import { SettleDialog, type SettleDraft } from "@/components/settle-dialog";
import { sharesKey } from "@/components/shares-query";
import { ShareExpenseDialog } from "@/components/share-expense-dialog";
import { TransactionDialog } from "@/components/transaction-dialog";
import { useLedger } from "@/components/use-ledger";
import { useShares } from "@/components/use-shares";
import { Button } from "@/components/ui/button";
import type { BalanceScope, ShareBook } from "@/db/shares";
import type { InitialData, KhataSnapshot } from "@/server/initial-data";
import type { TransactionDto } from "@/lib/types";

type Debt = Pick<BalanceScope["youOwe"][number], "fromId" | "toId" | "amount">;
type Expense = ShareBook["expenses"][number];
type Settlement = ShareBook["settlements"][number];

function suggestGroup(book: ShareBook, fromId: string, toId: string) {
  const hits = book.groups.filter((group) =>
    [...group.balances.youOwe, ...group.balances.youAreOwed, ...group.balances.others].some((debt) => debt.fromId === fromId && debt.toId === toId),
  );
  return hits.length === 1 ? hits[0]!.id : "";
}

/** A group someone else owns is a book of its own: its people, its expenses, nothing of yours. */
function scopeBook(book: ShareBook, groupId: string | null | undefined) {
  const joined = groupId ? book.joinedGroups.find((group) => group.id === groupId) : undefined;
  if (!joined) return { book, locked: false };
  const scoped: ShareBook = {
    ...book,
    self: joined.self,
    people: joined.people,
    groups: [{ id: joined.id, name: joined.name, kind: joined.kind, members: joined.members, balances: joined.balances }],
    joinedGroups: [],
    expenses: joined.expenses,
    settlements: joined.settlements,
    links: [],
  };
  return { book: scoped, locked: true };
}

const blankSettle: SettleDraft = { fromId: "", toId: "", amount: "", groupId: "" };

function useKhataState(snapshot: KhataSnapshot) {
  const ledger = useLedger(snapshot);
  const shares = useShares(snapshot.book);
  const frame = useFrame();
  const [composer, setComposer] = useState<{ open: boolean; editing?: TransactionDto }>({ open: false });
  const [expense, setExpense] = useState<{ open: boolean; groupId: string | null; editing?: Expense }>({ open: false, groupId: null });
  const [settle, setSettle] = useState<{ open: boolean; draft: SettleDraft; editing?: Settlement }>({ open: false, draft: blankSettle });

  function openSettle(debt: Debt, groupId = "") {
    const book = shares.book;
    const fromId = debt.fromId || book.self.id;
    const toId = debt.toId || book.people.find((person) => person.id !== fromId)?.id || book.self.id;
    setSettle({ open: true, draft: { fromId, toId, amount: debt.amount ? String(debt.amount) : "", groupId: groupId || suggestGroup(book, fromId, toId) } });
  }

  function openSettlement(editing: Settlement) {
    setSettle({
      open: true,
      editing,
      draft: {
        fromId: editing.fromPersonId,
        toId: editing.toPersonId,
        amount: String(editing.amount),
        groupId: editing.groupId ?? "",
      },
    });
  }

  return {
    today: ledger.summary.today,
    ledger,
    shares,
    signOut: frame.signOut,
    openAdd: () => setComposer({ open: true }),
    openEdit: (transaction: TransactionDto) => setComposer({ open: true, editing: transaction }),
    openExpense: (groupId: string | null, editing?: Expense) => setExpense({ open: true, groupId, editing }),
    openSettle,
    openSettlement,
    inviteActions: { ensureDirect: shares.ensureDirect, createGroup: shares.addGroup, updateGroup: shares.updateGroup, createInvite: shares.createInvite },
    loadSample: async () => {
      const result = await ledger.loadSample();
      await shares.reload();
      return result;
    },
    dialogs: { composer, setComposer, expense, setExpense, settle, setSettle },
  };
}

export type Khata = Omit<ReturnType<typeof useKhataState>, "dialogs">;

const KhataContext = createContext<Khata | null>(null);

/** Ledger, share book and the dialogs that write to them. Only usable under a page in the (app) group. */
export function useKhata() {
  const value = useContext(KhataContext);
  if (!value) throw new Error("useKhata must be used inside KhataData");
  return value;
}

/**
 * Unwraps the data the layout started reading on the server. Suspends until it
 * arrives, so the route skeleton shows in the meantime instead of a spinner.
 */
export function KhataData({ initial, children }: { initial: Promise<InitialData>; children: ReactNode }) {
  const result = use(initial);
  if (!result.ok) return <Unavailable message={result.error} />;
  return <KhataReady snapshot={result.data}>{children}</KhataReady>;
}

function Unavailable({ message }: { message: string }) {
  const router = useRouter();
  return (
    <section className="max-w-md py-10">
      <h1 className="display text-3xl">The ledger is out of reach</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
      <Button type="button" className="mt-4" onClick={() => router.refresh()}>
        Try again
      </Button>
    </section>
  );
}

/**
 * Hand a newly rendered server snapshot to React Query.
 *
 * `initialData` seeds a query only while it has no data at all, so it covers the
 * first paint and nothing after. That left every later server render — a
 * `router.refresh()` after accepting an invite, after a profile change, the retry
 * on the error screen above — re-fetching a snapshot the layout had already read
 * from the database and then quietly throwing it away. The screen kept showing
 * whatever it had last asked for, which is the shape of bug that reads as
 * "caching is not working".
 *
 * A new snapshot object only arrives when the server actually rendered the layout
 * again, so this cannot fire between a write and its own optimistic update: the
 * dependency stays put for as long as the current render is on screen.
 */
function useSnapshotSync(snapshot: KhataSnapshot) {
  const queryClient = useQueryClient();
  useEffect(() => {
    queryClient.setQueryData(summaryKey, snapshot.summary);
    queryClient.setQueryData(accountsKey, snapshot.accounts);
    queryClient.setQueryData(categoriesKey, snapshot.categories);
    queryClient.setQueryData(transactionsKey, snapshot.transactions);
    queryClient.setQueryData(sharesKey, snapshot.book);
  }, [queryClient, snapshot]);
}

function KhataReady({ snapshot, children }: { snapshot: KhataSnapshot; children: ReactNode }) {
  const { dialogs, ...khata } = useKhataState(snapshot);
  const { composer, setComposer, expense, setExpense, settle, setSettle } = dialogs;
  const frame = useFrame();
  useSnapshotSync(snapshot);
  useLaunchActions();
  // The shell's Add and Split buttons (and the installed app's shortcuts) ask through the frame.
  const composerOpen = composer.open || frame.pending === "add";
  const expenseOpen = expense.open || frame.pending === "split";

  const book = khata.shares.book;
  const fresh = frame.pending === "split";
  const expenseScope = scopeBook(book, fresh ? null : (expense.editing?.groupId ?? expense.groupId));
  const settleScope = scopeBook(book, settle.editing?.groupId ?? settle.draft.groupId);

  return (
    <KhataContext value={khata}>
      {children}
      <TransactionDialog
        open={composerOpen}
        today={khata.today}
        accounts={khata.ledger.accounts}
        categories={khata.ledger.categories}
        transaction={frame.pending === "add" ? undefined : composer.editing}
        onOpenChange={(open) => {
          if (!open) frame.clear();
          setComposer((current) => ({ ...current, open }));
        }}
        onSave={khata.ledger.saveTransaction}
        onDelete={khata.ledger.removeTransaction}
      />
      <ShareExpenseDialog
        open={expenseOpen}
        today={khata.today}
        book={expenseScope.book}
        groupLocked={expenseScope.locked}
        transactions={expenseScope.locked ? [] : khata.ledger.transactions}
        expense={fresh ? undefined : expense.editing}
        groupId={fresh ? null : expense.groupId}
        onOpenChange={(open) => {
          if (!open) frame.clear();
          setExpense((current) => ({ ...current, open }));
        }}
        onSave={khata.shares.saveExpense}
        onDelete={khata.shares.deleteExpense}
      />
      <SettleDialog
        open={settle.open}
        today={khata.today}
        book={settleScope.book}
        groupLocked={settleScope.locked}
        transactions={settleScope.locked ? [] : khata.ledger.transactions}
        draft={settle.draft}
        settlement={settle.editing}
        onOpenChange={(open) => setSettle((current) => ({ ...current, open }))}
        onSave={khata.shares.saveSettlement}
        onDelete={khata.shares.deleteSettlement}
      />
    </KhataContext>
  );
}

/** `?action=add|split` comes from the installed app's shortcuts. Hand it to the frame once, then drop it from the URL. */
function useLaunchActions() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const frame = useFrame();
  const action = params.get("action");
  useEffect(() => {
    if (action !== "add" && action !== "split") return;
    frame.request(action);
    const rest = new URLSearchParams(params);
    rest.delete("action");
    rest.delete("source");
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [action, frame, params, pathname, router]);
}
