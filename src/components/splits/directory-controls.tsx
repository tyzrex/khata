"use client";

import { cn } from "cn";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export type DirectoryFilter = "all" | "open" | "settled";
export type DirectorySort = "balance" | "name" | "recent";

export function DirectoryControls({
  query,
  onQuery,
  filter,
  onFilter,
  sort,
  onSort,
  noun,
  counts,
}: {
  query: string;
  onQuery: (value: string) => void;
  filter: DirectoryFilter;
  onFilter: (value: DirectoryFilter) => void;
  sort: DirectorySort;
  onSort: (value: DirectorySort) => void;
  noun: "friends" | "groups";
  counts: Record<DirectoryFilter, number>;
}) {
  return (
    <div className="mt-4 space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={`Search ${noun}`}
          aria-label={`Search ${noun}`}
          className="h-11 pr-11 pl-9 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onQuery("")}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-xl text-muted-foreground outline-none hover:text-display focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <div
        className="flex gap-1 rounded-xl bg-secondary p-1"
        role="group"
        aria-label={`Filter ${noun} by balance`}
      >
        {(
          [
            ["all", "All"],
            ["open", "To settle"],
            ["settled", "Settled"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => onFilter(value)}
            className={cn(
              "flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filter === value
                ? "bg-card text-display shadow-sm"
                : "text-muted-foreground hover:text-display",
            )}
          >
            {label}
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {counts[value]}
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 border-b border-border pb-3 text-xs text-muted-foreground">
        <span>Sort by</span>
        <select
          aria-label={`Sort ${noun}`}
          value={sort}
          onChange={(event) => onSort(event.target.value as DirectorySort)}
          className="min-h-8 max-w-full rounded-md bg-card py-1 pr-1 pl-2 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="balance">Highest balance</option>
          <option value="recent">Recent activity</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
    </div>
  );
}

export function DirectoryEmpty({
  noun,
  onReset,
}: {
  noun: "friends" | "groups";
  onReset: () => void;
}) {
  return (
    <div className="px-2 py-10 text-center">
      <p className="text-sm font-medium text-display">No {noun} found</p>
      <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
        Try another name or clear your filters.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-3 min-h-11 rounded-lg px-3 text-sm font-medium text-interactive underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Clear filters
      </button>
    </div>
  );
}
