"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LedgerFilters } from "@/components/use-ledger";
import { TX_TYPES, type TxType } from "@/lib/constants";
import { formatEntryDate, formatNpr } from "@/lib/format";
import type { CategoryDto, TransactionDto } from "@/lib/types";

function groupByDate(rows: TransactionDto[]) {
  const groups: { date: string; items: TransactionDto[] }[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last?.date === row.date) last.items.push(row);
    else groups.push({ date: row.date, items: [row] });
  }
  return groups;
}

export function Ledger({
  transactions,
  categories,
  filters,
  pending,
  onFilter,
  onEdit,
  onAdd,
}: {
  transactions: TransactionDto[];
  categories: CategoryDto[];
  filters: LedgerFilters;
  pending: boolean;
  onFilter: (filters: LedgerFilters) => void;
  onEdit: (transaction: TransactionDto) => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState(filters.q);
  const [syncedQuery, setSyncedQuery] = useState(filters.q);
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
  const groups = groupByDate(transactions);

  return (
    <div className="rise">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Ledger</p>
          <h1 className="figure mt-2 text-4xl">Every line</h1>
        </div>
        <Button type="button" className="h-10 px-4" onClick={onAdd}>
          Add entry
        </Button>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-[1.4fr_repeat(4,minmax(0,0.7fr))]">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search merchant, note, account" className="h-10" aria-label="Search entries" />
        <Select
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
        <Select value={filters.category || "all"} onValueChange={(value) => onFilter({ ...filters, category: !value || value === "all" ? "" : value })}>
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
        <Input type="date" aria-label="From date" value={filters.from} onChange={(event) => onFilter({ ...filters, from: event.target.value })} className="h-10" />
        <Input type="date" aria-label="To date" value={filters.to} onChange={(event) => onFilter({ ...filters, to: event.target.value })} className="h-10" />
      </div>
      {dirty ? (
        <button type="button" className="mt-3 text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => onFilter({ q: "", from: "", to: "", type: "", category: "" })}>
          Clear filters
        </button>
      ) : null}

      <div className={pending ? "mt-6 opacity-60" : "mt-6"}>
        {groups.length === 0 ? (
          <p className="border-t border-border py-10 text-sm text-muted-foreground">
            {dirty ? "No entries match these filters." : "No entries yet. Add one, or load the sample week from Sync."}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.date} className="border-t border-border">
              <h2 className="py-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">{formatEntryDate(group.date)}</h2>
              <ul>
                {group.items.map((transaction) => {
                  const incoming = transaction.type !== "expense";
                  return (
                    <li key={transaction.id} className="border-b border-border/80">
                      <button type="button" className="flex w-full items-start gap-3 py-3 text-left" onClick={() => onEdit(transaction)}>
                        <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: categories.find((category) => category.name === transaction.category)?.color ?? "#6f675e" }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{transaction.merchant}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {transaction.category}
                            <span className="px-1.5">·</span>
                            {transaction.account}
                          </span>
                          {transaction.note ? <span className="mt-1 block text-xs leading-5 text-muted-foreground">{transaction.note}</span> : null}
                        </span>
                        <span className={incoming ? "figure shrink-0 text-sm text-credit" : "figure shrink-0 text-sm"}>
                          {formatNpr(transaction.amount, incoming ? "in" : "out")}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
