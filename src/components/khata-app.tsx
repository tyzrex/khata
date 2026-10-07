"use client";

import { BookOpen, Download, Rows3, Tags } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSyncExternalStore, useState } from "react";
import { toast } from "sonner";
import { CategoriesView } from "@/components/categories-view";
import { Ledger } from "@/components/ledger";
import { Mark } from "@/components/mark";
import { Overview } from "@/components/overview";
import { SyncView } from "@/components/sync-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { TransactionDialog } from "@/components/transaction-dialog";
import { useLedger } from "@/components/use-ledger";
import { Button } from "@/components/ui/button";
import { formatLongDate } from "@/lib/format";
import type { TransactionDto } from "@/lib/types";

const views = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "ledger", label: "Ledger", icon: Rows3 },
  { id: "categories", label: "Categories", icon: Tags },
  { id: "sync", label: "Sync", icon: Download },
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

export function KhataApp() {
  const router = useRouter();
  const ledger = useLedger();
  const view = useSyncExternalStore(subscribeView, readView, () => "overview" as ViewId);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionDto | undefined>();

  function changeView(next: ViewId) {
    rememberView(next);
  }

  function openNew() {
    setEditing(undefined);
    setComposerOpen(true);
  }

  async function sample() {
    const result = await ledger.loadSample();
    toast.success(result.created ? "Sample week loaded" : "Sample week already in the ledger");
  }

  const today = ledger.summary?.today ?? "";

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col md:px-5 md:py-6">
        <div className="flex items-center gap-3">
          <Mark />
          <div>
            <p className="font-heading text-lg leading-none">Khata</p>
            <p className="mt-1 text-xs text-muted-foreground">NPR ledger</p>
          </div>
        </div>
        <nav className="mt-10 grid gap-1" aria-label="Sections">
          {views.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => changeView(item.id)}
                className={active ? "flex items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2 text-left text-sm" : "flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-sidebar-accent/70"}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <p className="mt-auto text-xs leading-5 text-muted-foreground">
          {ledger.auth.required ? "Passcode on" : "Open on this server"}
          <span className="mt-1 block">Kathmandu week</span>
        </p>
      </aside>

      <div className="min-w-0">
        <header className="flex items-center justify-between gap-3 px-4 pt-4 md:px-10 md:pt-6">
          <div className="flex items-center gap-3 md:block">
            <Mark className="size-8 md:hidden" />
            <div>
              <p className="font-heading text-lg leading-none md:hidden">Khata</p>
              <p className="text-sm text-muted-foreground md:text-base">{today ? formatLongDate(today) : "Kathmandu"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {ledger.auth.required ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  void fetch("/api/auth/logout", { method: "POST" }).then(() => {
                    router.push("/login");
                  });
                }}
              >
                Lock
              </Button>
            ) : null}
            <ThemeToggle />
          </div>
        </header>

        <main className="px-4 pt-6 pb-28 md:px-10 md:pt-8 md:pb-16">
          {ledger.status === "loading" ? <Skeleton /> : null}
          {ledger.status === "error" ? (
            <section className="max-w-lg py-10">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Connection</p>
              <h1 className="figure mt-3 text-4xl">The ledger is out of reach.</h1>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">{ledger.error}</p>
              <Button type="button" className="mt-6 h-11 px-4" onClick={() => void ledger.reload()}>
                Try again
              </Button>
            </section>
          ) : null}
          {ledger.status === "ready" && ledger.summary ? (
            <>
              {view === "overview" ? <Overview summary={ledger.summary} onAdd={openNew} onSample={sample} /> : null}
              {view === "ledger" ? (
                <Ledger
                  transactions={ledger.transactions}
                  categories={ledger.categories}
                  filters={ledger.filters}
                  pending={ledger.listPending}
                  onFilter={(filters) => void ledger.applyFilters(filters)}
                  onEdit={(transaction) => {
                    setEditing(transaction);
                    setComposerOpen(true);
                  }}
                  onAdd={openNew}
                />
              ) : null}
              {view === "categories" ? (
                <CategoriesView categories={ledger.categories} onSave={ledger.saveCategory} onDelete={ledger.removeCategory} />
              ) : null}
              {view === "sync" ? (
                <SyncView passcodeRequired={ledger.auth.required} onImport={ledger.importPayload} onSample={ledger.loadSample} />
              ) : null}
            </>
          ) : null}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Sections">
        <ul className="grid grid-cols-4">
          {views.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <li key={item.id}>
                <button type="button" className={active ? "flex w-full flex-col items-center gap-1 py-2 text-[11px] text-primary" : "flex w-full flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground"} onClick={() => changeView(item.id)}>
                  <Icon className="size-4" />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <TransactionDialog
        open={composerOpen}
        today={today}
        categories={ledger.categories}
        transaction={editing}
        onOpenChange={setComposerOpen}
        onSave={ledger.saveTransaction}
        onDelete={ledger.removeTransaction}
      />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="h-12 w-56 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="h-24 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
