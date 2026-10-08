"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/status";
import { AppShell, views, type ViewId } from "@/components/app-shell";
import { ActivityView } from "@/components/activity-view";
import { BalancesView } from "@/components/balances-view";
import { CategoriesView } from "@/components/categories-view";
import { SettingsView } from "@/components/settings-view";
import { FriendsView } from "@/components/friends-view";
import { GroupsView } from "@/components/groups-view";
import { Ledger } from "@/components/ledger";
import { Overview } from "@/components/overview";
import { SettleDialog, type SettleDraft } from "@/components/settle-dialog";
import { ShareExpenseDialog } from "@/components/share-expense-dialog";
import { SyncView } from "@/components/sync-view";
import { TransactionDialog } from "@/components/transaction-dialog";
import { useLedger } from "@/components/use-ledger";
import { useShares } from "@/components/use-shares";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";
import type { BalanceScope, ShareBook } from "@/db/shares";
import type { TransactionDto } from "@/lib/types";

const viewListeners = new Set<() => void>();

function readView(): ViewId {
  const value = new URLSearchParams(window.location.search).get("view");
  return views.some((view) => view.id === value) ? (value as ViewId) : "overview";
}

function subscribeView(listener: () => void) {
  viewListeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    viewListeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

function rememberView(next: ViewId) {
  const url = new URL(window.location.href);
  if (next === "overview") url.searchParams.delete("view");
  else url.searchParams.set("view", next);
  window.history.replaceState(null, "", url);
  viewListeners.forEach((listener) => listener());
}

type LaunchAction = "add" | "split";

/** `?action=add|split` comes from the installed app's shortcuts; it opens the matching dialog once. */
function readAction(): LaunchAction | null {
  const value = new URLSearchParams(window.location.search).get("action");
  return value === "add" || value === "split" ? value : null;
}

function clearAction() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("action")) return;
  url.searchParams.delete("action");
  window.history.replaceState(null, "", url);
  viewListeners.forEach((listener) => listener());
}

function suggestGroup(book: ShareBook, fromId: string, toId: string) {
  const hits = book.groups.filter((group) =>
    [...group.balances.youOwe, ...group.balances.youAreOwed, ...group.balances.others].some((debt) => debt.fromId === fromId && debt.toId === toId),
  );
  return hits.length === 1 ? hits[0]!.id : "";
}

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

export function KhataApp({ user }: { user: { name: string; email: string } }) {
  const router = useRouter();
  const ledger = useLedger();
  const shares = useShares();
  const view = useSyncExternalStore(subscribeView, readView, () => "overview" as ViewId);
  const action = useSyncExternalStore(subscribeView, readAction, () => null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionDto | undefined>();
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ShareBook["expenses"][number] | undefined>();
  const [expenseGroup, setExpenseGroup] = useState<string | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleDraft, setSettleDraft] = useState<SettleDraft>(blankSettle);

  function changeView(next: ViewId) {
    rememberView(next);
  }

  function openSettle(debt: Pick<BalanceScope["youOwe"][number], "fromId" | "toId" | "amount">, groupId = "") {
    if (!shares.book) return;
    const fromId = debt.fromId || shares.book.self.id;
    const toId = debt.toId || shares.book.people.find((person) => person.id !== fromId)?.id || shares.book.self.id;
    setSettleDraft({
      fromId,
      toId,
      amount: debt.amount ? String(debt.amount) : "",
      groupId: groupId || suggestGroup(shares.book, fromId, toId),
    });
    setSettleOpen(true);
  }

  function openExpense(groupId: string | null, expense?: ShareBook["expenses"][number]) {
    setExpenseGroup(groupId);
    setEditingExpense(expense);
    setExpenseOpen(true);
  }

  const inviteActions = { ensureDirect: shares.ensureDirect, createGroup: shares.addGroup, updateGroup: shares.updateGroup, createInvite: shares.createInvite };
  const today = ledger.summary?.today ?? "";
  const expenseScope = shares.book ? scopeBook(shares.book, editingExpense?.groupId ?? expenseGroup) : null;
  const settleScope = shares.book ? scopeBook(shares.book, settleDraft.groupId) : null;

  function signOut() {
    // The service worker drops its caches so nothing from this session outlives it on a shared device.
    navigator.serviceWorker?.controller?.postMessage({ type: "khata:sign-out" });
    void authClient.signOut().then(() => {
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <AppShell
      user={user}
      today={today}
      view={view}
      onView={changeView}
      onAdd={() => {
        setEditing(undefined);
        setComposerOpen(true);
      }}
      onSplit={() => openExpense(null)}
      onSignOut={signOut}
    >
      <>
          {ledger.status === "loading" ? <Loading /> : null}
          {ledger.status === "error" ? (
            <section className="max-w-md py-10">
              <h1 className="display text-3xl">The ledger is out of reach</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{ledger.error}</p>
              <Button type="button" className="mt-4" onClick={() => void ledger.reload()}>
                Try again
              </Button>
            </section>
          ) : null}
          {ledger.status === "ready" && ledger.summary ? (
            <>
              {view === "overview" ? (
                <Overview
                  transactions={ledger.allTransactions}
                  categories={ledger.categories}
                  today={today}
                  book={shares.book}
                  onLedger={() => changeView("ledger")}
                  onAdd={() => {
                    setEditing(undefined);
                    setComposerOpen(true);
                  }}
                  onSplit={() => openExpense(null)}
                  onSample={async () => {
                    const result = await ledger.loadSample();
                    await shares.reload();
                    toast.success(result.created ? "Sample week loaded" : "Sample week already in the ledger");
                  }}
                  onBalances={() => changeView("balances")}
                  onFriends={() => changeView("friends")}
                  onGroups={() => changeView("groups")}
                />
              ) : null}
              {view === "balances" && shares.book ? (
                <BalancesView
                  book={shares.book}
                  onSettle={(debt, groupId) => openSettle(debt, groupId)}
                />
              ) : null}
              {view === "friends" && shares.book ? (
                <FriendsView
                  book={shares.book}
                  onSettle={(debt, groupId) => openSettle(debt, groupId)}
                  onAddExpense={(groupId) => openExpense(groupId)}
                  onEditExpense={(expense) => openExpense(expense.groupId, expense)}
                  onGroups={() => changeView("groups")}
                  addFriend={shares.addFriend}
                  onRenamePerson={shares.renamePerson}
                  onDeletePerson={shares.deletePerson}
                  inviteActions={inviteActions}
                />
              ) : null}
              {view === "groups" && shares.book ? (
                <GroupsView
                  book={shares.book}
                  onSettle={(debt, groupId) => openSettle(debt, groupId)}
                  onAddExpense={(groupId) => openExpense(groupId)}
                  onEditExpense={(expense) => openExpense(expense.groupId, expense)}
                  onCreateGroup={shares.createGroup}
                  onUpdateGroup={shares.updateGroup}
                  onDeleteGroup={shares.deleteGroup}
                  inviteActions={inviteActions}
                />
              ) : null}
              {view === "ledger" ? (
                <Ledger
                  transactions={ledger.transactions}
                  categories={ledger.categories}
                  filters={ledger.filters}
                  pending={ledger.listPending}
                  links={shares.book?.links ?? []}
                  onFilter={(filters) => void ledger.applyFilters(filters)}
                  onEdit={(transaction) => {
                    setEditing(transaction);
                    setComposerOpen(true);
                  }}
                  onAdd={() => {
                    setEditing(undefined);
                    setComposerOpen(true);
                  }}
                />
              ) : null}
              {view === "activity" && shares.book ? (
                <ActivityView
                  book={shares.book}
                  onEditExpense={(expense) => openExpense(expense.groupId, expense)}
                  onDeleteSettlement={async (id) => {
                    await shares.deleteSettlement(id);
                    toast.success("Settlement removed");
                  }}
                />
              ) : null}
              {view === "settings" && today ? <SettingsView today={today} user={user} onSignOut={signOut} /> : null}
              {view === "categories" ? <CategoriesView categories={ledger.categories} onSave={ledger.saveCategory} onDelete={ledger.removeCategory} /> : null}
              {view === "sync" ? <SyncView onImport={ledger.importPayload} onSample={async () => {
                const result = await ledger.loadSample();
                await shares.reload();
                return result;
              }} /> : null}
              {shares.status === "error" && (view === "balances" || view === "groups" || view === "activity") ? (
                <section className="max-w-md">
                  <h1 className="display text-3xl">The share book is out of reach</h1>
                  <p className="mt-2 text-sm text-muted-foreground">{shares.error}</p>
                  <Button type="button" className="mt-4" onClick={() => void shares.reload()}>
                    Try again
                  </Button>
                </section>
              ) : null}
              {shares.status === "loading" && (view === "balances" || view === "groups" || view === "friends" || view === "activity") ? <Loading /> : null}
            </>
          ) : null}
      </>

      <TransactionDialog
        open={composerOpen || (action === "add" && today !== "")}
        today={today}
        categories={ledger.categories}
        transaction={editing}
        onOpenChange={(open) => {
          if (!open) clearAction();
          setComposerOpen(open);
        }}
        onSave={ledger.saveTransaction}
        onDelete={ledger.removeTransaction}
      />

      {shares.book && expenseScope && settleScope ? (
        <>
          <ShareExpenseDialog
            open={expenseOpen || (action === "split" && today !== "")}
            today={today}
            book={expenseScope.book}
            groupLocked={expenseScope.locked}
            transactions={expenseScope.locked ? [] : ledger.allTransactions}
            expense={editingExpense}
            groupId={expenseGroup}
            onOpenChange={(open) => {
              if (!open) clearAction();
              setExpenseOpen(open);
            }}
            onSave={shares.saveExpense}
            onDelete={shares.deleteExpense}
          />
          <SettleDialog
            open={settleOpen}
            today={today}
            book={settleScope.book}
            groupLocked={settleScope.locked}
            transactions={settleScope.locked ? [] : ledger.allTransactions}
            draft={settleDraft}
            onOpenChange={setSettleOpen}
            onSave={shares.saveSettlement}
          />
        </>
      ) : null}
    </AppShell>
  );
}
