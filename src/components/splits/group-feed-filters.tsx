"use client";

import { FilterX, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { GroupView } from "@/components/splits/group-detail";
import { DateRangePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SHARED_CATEGORIES } from "@/lib/constants";
import {
  applyGroupFilters,
  describeGroupFeedFilters,
  FEED_TYPES,
  hasGroupFeedFilters,
  readGroupFeedFilters,
  writeGroupFeedFilters,
  type GroupFeedFilters,
} from "@/lib/group-filters";

/**
 * Filter state lives in the URL so Back, refresh and a shared link all land on the
 * same view. Writes replace rather than push, so typing in the search box does not
 * fill the history with a keystroke per character.
 */
export function useGroupFeedFilters() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const value = readGroupFeedFilters(params);

  function set(patch: Partial<GroupFeedFilters>) {
    const next = writeGroupFeedFilters(params, { ...value, ...patch });
    const text = next.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  }

  function reset() {
    const next = new URLSearchParams(params);
    for (const key of ["q", "category", "member", "type", "from", "to"]) next.delete(key);
    const text = next.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  }

  return { value, set, reset };
}

/**
 * The search box is the only field that waits; the rest apply on change.
 *
 * Local text is adjusted during render rather than in an effect: when the URL
 * value moves under us (reset, shared link, Back) the box is re-synced, and doing
 * that in render keeps the caret where the person left it. An effect here would
 * cascade a second render per keystroke.
 */
function DebouncedSearch({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const [text, setText] = useState(value);
  const [committed, setCommitted] = useState(value);
  if (value !== committed) {
    setCommitted(value);
    setText(value);
  }

  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => onCommit(text), 250);
    return () => clearTimeout(timer);
  }, [text, value, onCommit]);
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search description or note"
        aria-label="Search this group's activity"
        className="h-10 w-full pl-9"
      />
    </div>
  );
}

const TYPE_LABELS: Record<(typeof FEED_TYPES)[number], string> = { all: "Everything", expense: "Expenses only", payment: "Payments only" };

export function GroupFeedFilterBar({
  group,
  filters,
  counts,
}: {
  group: GroupView;
  filters: GroupFeedFilters;
  /** Total rows in this group, before filtering. */
  counts: number;
}) {
  const { set, reset } = useGroupFeedFilters();
  const active = hasGroupFeedFilters(filters);
  const shown = applyGroupFilters(
    [
      ...group.expenses.map((expense) => ({ kind: "expense" as const, date: expense.date, id: expense.id, expense })),
      ...group.settlements.map((settlement) => ({ kind: "settlement" as const, date: settlement.date, id: settlement.id, settlement })),
    ],
    filters,
    { members: group.members },
  ).length;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
        <DebouncedSearch value={filters.q} onCommit={(next) => set({ q: next })} />

        <Select value={filters.type} onValueChange={(next) => set({ type: (next ?? "all") as GroupFeedFilters["type"] })}>
          <SelectTrigger className="h-10 w-[9.5rem]" aria-label="Filter by entry type">
            <SelectValue>{TYPE_LABELS[filters.type]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {FEED_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.category || "any"} onValueChange={(next) => set({ category: next === "any" ? "" : (next ?? "") })}>
          <SelectTrigger className="h-10 w-[9.5rem]" aria-label="Filter by category">
            <SelectValue>{filters.category || "Any category"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any category</SelectItem>
            {SHARED_CATEGORIES.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.member || "any"} onValueChange={(next) => set({ member: next === "any" ? "" : (next ?? "") })}>
          <SelectTrigger className="h-10 w-[9.5rem]" aria-label="Filter by member">
            <SelectValue>{group.members.find((member) => member.id === filters.member)?.name ?? "Anyone"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Anyone</SelectItem>
            {group.members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {active ? (
          <Button type="button" variant="ghost" size="sm" className="h-10" onClick={reset}>
            <FilterX />
            Reset
          </Button>
        ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker
          value={{ start: filters.from || filters.to || "2020-01-01", end: filters.to || filters.from || "2999-12-31" }}
          onChange={(range) => set({ from: range.start, to: range.end })}
          aria-label="Filter by date range"
          className="h-10"
        />
        <p className="text-xs text-muted-foreground">
          {active ? (
            <>
              Showing <span className="figure text-foreground">{shown}</span> of {counts} · {describeGroupFeedFilters(filters).join(" · ")}
            </>
          ) : (
            <>All {counts} entries in {group.name}</>
          )}
        </p>
      </div>
    </div>
  );
}
