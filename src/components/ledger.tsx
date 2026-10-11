"use client";

import { ChevronRight, Plus, ReceiptText, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SWATCHES, TX_TYPES, type TxType } from "@/lib/constants";
import { useDateFormat } from "@/components/use-date-style";
import { formatForeign, formatNpr, formatRate } from "@/lib/format";
import type { AccountDto, CategoryDto, TransactionDto } from "@/lib/types";
import { EMPTY_LEDGER_FILTERS, type LedgerFilters } from "@/lib/url-state";

type Link = { transactionId: string; kind: "settlement" | "expense"; title: string; shareAmount: number; bankAmount: number | null };

function groupByDate(rows: TransactionDto[]) {
  const groups: { date: string; items: TransactionDto[]; net: number }[] = [];
  for (const row of rows) {
    const signed = row.type === "expense" ? -row.amount : row.amount;
    const last = groups.at(-1);
    if (last?.date === row.date) {
      last.items.push(row);
      last.net += signed;
    } else groups.push({ date: row.date, items: [row], net: signed });
  }
  return groups;
}

function totals(rows: TransactionDto[]) {
  let credits = 0;
  let spent = 0;
  for (const row of rows) {
    if (row.type === "expense") spent += row.amount;
    else credits += row.amount;
  }
  return { credits, spent, net: credits - spent };
}

function signed(amount: number) {
  if (Math.abs(amount) < 0.005) return formatNpr(0);
  return formatNpr(Math.abs(amount), amount > 0 ? "in" : "out");
}

export function Ledger({
  transactions,
  categories,
  accounts,
  filters,
  onFilter,
  onEdit,
  onAdd,
  links,
}: {
  transactions: TransactionDto[];
  categories: CategoryDto[];
  accounts: AccountDto[];
  filters: LedgerFilters;
  onFilter: (filters: LedgerFilters) => void;
  onEdit: (transaction: TransactionDto) => void;
  onAdd: () => void;
  links: Link[];
}) {
  const dates = useDateFormat();
  const [query, setQuery] = useState(filters.q);
  const [syncedQuery, setSyncedQuery] = useState(filters.q);
  const [showFilters, setShowFilters] = useState(false);
  if (filters.q !== syncedQuery) {
    setSyncedQuery(filters.q);
    setQuery(filters.q);
  }
  useEffect(() => {
    if (query === filters.q) return;
    const timer = window.setTimeout(() => onFilter({ ...filters, q: query }), 250);
    return () => window.clearTimeout(timer);
  }, [query, filters, onFilter]);

  const dirty = Boolean(filters.q || filters.from || filters.to || filters.type || filters.category);
  const activeCount = [filters.from, filters.to, filters.type, filters.category, filters.account].filter(Boolean).length;
  const groups = groupByDate(transactions);
  const sum = totals(transactions);
  const colors = new Map(categories.map((category) => [category.name, category.color]));
  const linksFor = new Map<string, Link[]>();
  for (const link of links) linksFor.set(link.transactionId, [...(linksFor.get(link.transactionId) ?? []), link]);

  const chips = [
    filters.type ? { key: "type", label: filters.type[0]!.toUpperCase() + filters.type.slice(1), clear: () => onFilter({ ...filters, type: "" }) } : null,
    filters.category ? { key: "category", label: filters.category, clear: () => onFilter({ ...filters, category: "" }) } : null,
    filters.from ? { key: "from", label: `From ${dates.entry(filters.from)}`, clear: () => onFilter({ ...filters, from: "" }) } : null,
    filters.to ? { key: "to", label: `To ${dates.entry(filters.to)}`, clear: () => onFilter({ ...filters, to: "" }) } : null,
  ].filter((chip) => chip != null);

  return (
    <div className="rise flex flex-col gap-6">
      <PageHeader
        eyebrow="Bank and cash"
        title="Ledger"
        description="Bank and cash lines. Shared splits stay in their own book."
        actions={
          <Button type="button" onClick={onAdd}>
            <Plus />
            Add entry
          </Button>
        }
      />

      <div className="flex flex-col gap-3 2xl:gap-4">
        <section className="grid grid-cols-3 rounded-3xl bg-card shadow-card" aria-label="Totals for the entries shown" aria-live="polite">
          <Total label="Money in" value={formatNpr(sum.credits)} tone="text-credit" className="border-r border-border" />
          <Total label="Money out" value={formatNpr(sum.spent)} className="border-r border-border" />
          <Total label="Net" value={signed(sum.net)} tone={sum.net < 0 ? "text-negative" : "text-display"} />
        </section>

        <section className="rounded-3xl bg-card p-3 shadow-card sm:p-4" aria-label="Filters">
          <div className="flex gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search entries</span>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search merchant, note, account" className="pl-10" type="search" />
            </label>
            <Button
              type="button"
              variant="outline"
              className="relative shrink-0 gap-2 px-3.5 lg:hidden"
              aria-expanded={showFilters}
              aria-controls="ledger-filters"
              onClick={() => setShowFilters((value) => !value)}
            >
              <SlidersHorizontal />
              <span className="max-sm:sr-only">Filters</span>
              {activeCount ? <span className="flex size-5 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">{activeCount}</span> : null}
            </Button>
          </div>

          <div id="ledger-filters" className={`${showFilters ? "grid" : "hidden"} mt-2 grid-cols-2 gap-2 lg:mt-3 lg:grid lg:grid-cols-5`}>
            <Select
              items={{ all: "All types", expense: "Expense", income: "Income", transfer: "Transfer" }}
              value={filters.type || "all"}
              onValueChange={(value) => onFilter({ ...filters, type: value && value !== "all" ? (value as TxType) : "" })}
            >
              <SelectTrigger className="w-full" aria-label="Filter by type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {TX_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type[0]!.toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={{ all: "All categories", ...Object.fromEntries(categories.map((category) => [category.name, category.name])) }}
              value={filters.category || "all"}
              onValueChange={(value) => onFilter({ ...filters, category: !value || value === "all" ? "" : value })}
            >
              <SelectTrigger className="w-full" aria-label="Filter by category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.name}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={{ all: "All accounts", ...Object.fromEntries(accounts.map((account) => [account.name, account.name])) }}
              value={filters.account || "all"}
              onValueChange={(value) => onFilter({ ...filters, account: !value || value === "all" ? "" : value })}
            >
              <SelectTrigger className="w-full" aria-label="Filter by account">
                <SelectValue placeholder="Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.name}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DatePicker aria-label="From date" placeholder="From date" clearable max={filters.to || undefined} value={filters.from} onChange={(from) => onFilter({ ...filters, from })} className="h-11" />
            <DatePicker aria-label="To date" placeholder="To date" clearable min={filters.from || undefined} value={filters.to} onChange={(to) => onFilter({ ...filters, to })} className="h-11" />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2" aria-live="polite">
            <p className="text-xs font-medium text-muted-foreground">
              {transactions.length} {transactions.length === 1 ? "entry" : "entries"}
              {dirty ? " matching" : ""}
            </p>
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.clear}
                className="deva inline-flex h-7 items-center gap-1 rounded-lg bg-accent pr-1.5 pl-2.5 text-xs font-medium text-accent-foreground transition-colors outline-none hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Remove filter: ${chip.label}`}
              >
                {chip.label}
                <X className="size-3.5" aria-hidden />
              </button>
            ))}
            {dirty ? (
              <button
                type="button"
                className="ml-auto rounded-lg px-2 py-1 text-xs font-medium text-interactive transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setQuery("");
                  onFilter(EMPTY_LEDGER_FILTERS);
                }}
              >
                Clear all
              </button>
            ) : null}
          </div>
        </section>

        <div>
          {groups.length === 0 ? (
            <section className="flex flex-col items-center rounded-3xl bg-card px-6 py-16 text-center shadow-card">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <ReceiptText className="size-5" aria-hidden />
              </span>
              <h2 className="mt-4 text-[15px] font-semibold tracking-[-0.015em] text-display">{dirty ? "No entries match" : "No entries yet"}</h2>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">{dirty ? "Loosen a filter or clear them all to see every line." : "Add your first entry, or load the sample week from Sync."}</p>
              <div className="mt-5 flex gap-2">
                {dirty ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      onFilter(EMPTY_LEDGER_FILTERS);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button type="button" onClick={onAdd}>
                    <Plus />
                    Add entry
                  </Button>
                )}
              </div>
            </section>
          ) : (
            <div className="flex flex-col gap-3 2xl:gap-4">
              {groups.map((group) => (
                <section key={group.date} className="rounded-3xl bg-card shadow-card" aria-labelledby={`day-${group.date}`}>
                  <header className="sticky top-[68px] z-10 flex items-baseline justify-between gap-3 rounded-t-3xl border-b border-border bg-card/95 px-4 py-3 backdrop-blur-sm sm:px-5 lg:top-0 2xl:px-6">
                    <h2 id={`day-${group.date}`} className="deva text-[13px] font-semibold text-display">
                      {dates.entry(group.date)}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      <span className="mr-2">
                        {group.items.length} {group.items.length === 1 ? "entry" : "entries"}
                      </span>
                      <span className={`figure ${group.net < 0 ? "text-display" : "text-credit"}`}>{signed(group.net)}</span>
                    </p>
                  </header>
                  <ul className="divide-y divide-border px-2 py-1 sm:px-3 2xl:px-4">
                    {group.items.map((transaction, index) => (
                      <Row
                        key={transaction.id}
                        transaction={transaction}
                        color={colors.get(transaction.category) ?? SWATCHES[index % SWATCHES.length]!}
                        links={linksFor.get(transaction.id) ?? []}
                        onEdit={onEdit}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Total({ label, value, tone = "text-display", className }: { label: string; value: string; tone?: string; className?: string }) {
  return (
    <div className={`min-w-0 p-3 sm:p-5 2xl:p-6 ${className ?? ""}`}>
      <p className="label">{label}</p>
      <p className={`figure mt-1 truncate text-sm sm:mt-1.5 sm:text-xl ${tone}`} title={value}>{value}</p>
    </div>
  );
}

/** One statement line. The whole row opens the editor; the chevron says so on touch screens. */
function Row({ transaction, color, links, onEdit }: { transaction: TransactionDto; color: string; links: Link[]; onEdit: (transaction: TransactionDto) => void }) {
  const incoming = transaction.type !== "expense";
  return (
    <li>
      <button
        type="button"
        className="group/row flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors duration-200 outline-none hover:bg-secondary focus-visible:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onEdit(transaction)}
        aria-label={`Edit ${transaction.merchant}, ${formatNpr(transaction.amount, incoming ? "in" : "out")}`}
      >
        <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground" aria-hidden>
          {transaction.merchant.trim().slice(0, 1).toUpperCase() || "?"}
          <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-card" style={{ background: color }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-display">{transaction.merchant}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {transaction.category}
            <span className="px-1 text-disabled">·</span>
            {transaction.account}
            {transaction.type === "transfer" ? (
              <>
                <span className="px-1 text-disabled">·</span>Transfer
              </>
            ) : null}
            {transaction.foreignAmount != null && transaction.fxRate != null ? (
              <>
                <span className="px-1 text-disabled">·</span>
                <span title={`${formatForeign(transaction.foreignAmount, transaction.currency)} at ${formatRate(transaction.fxRate)} per ${transaction.currency}`}>
                  {formatForeign(transaction.foreignAmount, transaction.currency)} @ {formatRate(transaction.fxRate)}
                </span>
              </>
            ) : null}
          </span>
          {transaction.note ? <span className="mt-1 block truncate text-xs text-muted-foreground/80">{transaction.note}</span> : null}
          {links.map((link) => (
            <span key={link.kind + link.title} className="mt-1.5 flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">{link.kind === "settlement" ? "Settlement" : "Shared"}</span>
              <span className="truncate text-xs text-muted-foreground">
                {link.title}
                {link.kind === "settlement" && link.bankAmount != null && link.bankAmount !== link.shareAmount ? ` · book ${formatNpr(link.shareAmount)}` : ""}
              </span>
            </span>
          ))}
        </span>
        <span className={incoming ? "figure shrink-0 text-right text-sm text-credit" : "figure shrink-0 text-right text-sm text-display"}>
          {formatNpr(transaction.amount, incoming ? "in" : "out")}
        </span>
        <ChevronRight className="size-4 shrink-0 text-disabled transition-transform duration-200 group-hover/row:translate-x-0.5" aria-hidden />
      </button>
    </li>
  );
}
