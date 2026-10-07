"use client";

import { Download, History, LayoutDashboard, Rows3, Scale, Tags, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { ActivityView } from "@/components/activity-view";
import { BalancesView } from "@/components/balances-view";
import { CategoriesView } from "@/components/categories-view";
import { GroupsView } from "@/components/groups-view";
import { Ledger } from "@/components/ledger";
import { Mark } from "@/components/mark";
import { Overview } from "@/components/overview";
import { SettleDialog, type SettleDraft } from "@/components/settle-dialog";
import { ShareExpenseDialog } from "@/components/share-expense-dialog";
import { SyncView } from "@/components/sync-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { TransactionDialog } from "@/components/transaction-dialog";
import { useLedger } from "@/components/use-ledger";
import { useShares } from "@/components/use-shares";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { BalanceScope, ShareBook } from "@/db/shares";
import { formatLongDate } from "@/lib/format";
import type { TransactionDto } from "@/lib/types";

const views = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, mobile: true },
  { id: "balances", label: "Balances", icon: Scale, mobile: true },
  { id: "groups", label: "Groups", icon: Users, mobile: true },
  { id: "ledger", label: "Ledger", icon: Rows3, mobile: true },
  { id: "activity", label: "Activity", icon: History, mobile: false },
  { id: "categories", label: "Categories", icon: Tags, mobile: false },
  { id: "sync", label: "Sync", icon: Download, mobile: false },
] as const;

type ViewId = (typeof views)[number]["id"];

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
    groups: [{ id: joined.id, name: joined.name, members: joined.members, balances: joined.balances }],
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
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionDto | undefined>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ShareBook["expenses"][number] | undefined>();
  const [expenseGroup, setExpenseGroup] = useState<string | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleDraft, setSettleDraft] = useState<SettleDraft>(blankSettle);

  function changeView(next: ViewId) {
    rememberView(next);
    setMenuOpen(false);
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

  const today = ledger.summary?.today ?? "";
  const sum = (debts: { amount: number }[]) => debts.reduce((total, debt) => total + debt.amount, 0);
  const owe = shares.book ? sum(shares.book.overall.youOwe) + shares.book.joinedGroups.reduce((total, group) => total + sum(group.balances.youOwe), 0) : null;
  const owed = shares.book ? sum(shares.book.overall.youAreOwed) + shares.book.joinedGroups.reduce((total, group) => total + sum(group.balances.youAreOwed), 0) : null;
  const expenseScope = shares.book ? scopeBook(shares.book, editingExpense?.groupId ?? expenseGroup) : null;
  const settleScope = shares.book ? scopeBook(shares.book, settleDraft.groupId) : null;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col md:px-3 md:py-4">
        <div className="flex items-center gap-2.5 px-2 py-1">
          <Mark className="size-7" />
          <div>
            <p className="text-sm font-medium tracking-tight">Khata</p>
            <p className="text-xs text-muted-foreground">NPR</p>
          </div>
        </div>
        <nav className="mt-6 flex flex-col gap-0.5" aria-label="Sections">
          {views.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => changeView(item.id)}
                className={active ? "flex items-center gap-2 rounded-md bg-sidebar-accent px-2 py-1.5 text-left text-sm font-medium" : "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto px-2">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-8">
          <div className="flex items-center gap-2.5 md:block">
            <Mark className="size-7 md:hidden" />
            <div>
              <p className="text-sm font-medium tracking-tight md:hidden">Khata</p>
              <p className="text-sm text-muted-foreground">{today ? formatLongDate(today) : "Kathmandu"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" className="md:hidden" onClick={() => setMenuOpen(true)}>
              More
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void authClient.signOut().then(() => {
                  router.push("/login");
                  router.refresh();
                });
              }}
            >
              Sign out
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <main className="px-4 py-6 pb-24 md:px-8 md:pb-16">
          {ledger.status === "loading" ? (
            <div className="flex flex-col gap-4" aria-hidden>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : null}
          {ledger.status === "error" ? (
            <section className="max-w-md py-10">
              <h1 className="text-lg font-medium">The ledger is out of reach</h1>
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
                  summary={ledger.summary}
                  owe={owe}
                  owed={owed}
                  onAdd={() => {
                    setEditing(undefined);
                    setComposerOpen(true);
                  }}
                  onSample={async () => {
                    const result = await ledger.loadSample();
                    await shares.reload();
                    toast.success(result.created ? "Sample week loaded" : "Sample week already in the ledger");
                  }}
                  onBalances={() => changeView("balances")}
                />
              ) : null}
              {view === "balances" && shares.book ? (
                <BalancesView
                  book={shares.book}
                  onSettle={(debt, groupId) => openSettle(debt, groupId)}
                  onCreatePerson={shares.createPerson}
                  onRenamePerson={shares.renamePerson}
                  onDeletePerson={shares.deletePerson}
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
                  onCreateInvite={shares.createInvite}
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
              {view === "categories" ? <CategoriesView categories={ledger.categories} onSave={ledger.saveCategory} onDelete={ledger.removeCategory} /> : null}
              {view === "sync" ? <SyncView onImport={ledger.importPayload} onSample={async () => {
                const result = await ledger.loadSample();
                await shares.reload();
                return result;
              }} /> : null}
              {shares.status === "error" && (view === "balances" || view === "groups" || view === "activity") ? (
                <section className="max-w-md">
                  <h1 className="text-lg font-medium">The share book is out of reach</h1>
                  <p className="mt-2 text-sm text-muted-foreground">{shares.error}</p>
                  <Button type="button" className="mt-4" onClick={() => void shares.reload()}>
                    Try again
                  </Button>
                </section>
              ) : null}
              {shares.status === "loading" && (view === "balances" || view === "groups" || view === "activity") ? <Skeleton className="h-40 w-full" /> : null}
            </>
          ) : null}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Sections">
        <ul className="grid grid-cols-4">
          {views.filter((item) => item.mobile).map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <li key={item.id}>
                <button type="button" className={active ? "flex w-full flex-col items-center gap-1 py-2 text-[11px] text-foreground" : "flex w-full flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground"} onClick={() => changeView(item.id)}>
                  <Icon className="size-4" />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>More</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            {views.filter((item) => !item.mobile).map((item) => (
              <Button key={item.id} type="button" variant="ghost" className="justify-start" onClick={() => changeView(item.id)}>
                {item.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <TransactionDialog
        open={composerOpen}
        today={today}
        categories={ledger.categories}
        transaction={editing}
        onOpenChange={setComposerOpen}
        onSave={ledger.saveTransaction}
        onDelete={ledger.removeTransaction}
      />

      {shares.book && expenseScope && settleScope ? (
        <>
          <ShareExpenseDialog
            open={expenseOpen}
            today={today}
            book={expenseScope.book}
            groupLocked={expenseScope.locked}
            transactions={expenseScope.locked ? [] : ledger.transactions}
            expense={editingExpense}
            groupId={expenseGroup}
            onOpenChange={setExpenseOpen}
            onSave={shares.saveExpense}
            onDelete={shares.deleteExpense}
          />
          <SettleDialog
            open={settleOpen}
            today={today}
            book={settleScope.book}
            groupLocked={settleScope.locked}
            transactions={settleScope.locked ? [] : ledger.transactions}
            draft={settleDraft}
            onOpenChange={setSettleOpen}
            onSave={shares.saveSettlement}
          />
        </>
      ) : null}
    </div>
  );
}
