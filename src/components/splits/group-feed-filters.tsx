"use client";

import { FilterX, Search, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { GroupView } from "@/components/splits/group-detail";
import { DatePicker } from "@/components/date-picker";
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
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search expenses or payments"
        aria-label="Search this group's activity"
        className="h-11 w-full pl-9"
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
  const [expanded, setExpanded] = useState(Boolean(filters.category || filters.member || filters.from || filters.to));
  const advancedCount = [filters.category, filters.member, filters.from || filters.to].filter(Boolean).length;
  const shown = applyGroupFilters(
    [
      ...group.expenses.map((expense) => ({ kind: "expense" as const, date: expense.date, id: expense.id, expense })),
      ...group.settlements.map((settlement) => ({ kind: "settlement" as const, date: settlement.date, id: settlement.id, settlement })),
    ],
    filters,
    { members: group.members },
  ).length;

  return (
    <div className="mt-4 mb-4 flex flex-col gap-3 border-b border-border pb-4">
      <div className="flex items-center gap-2">
        <DebouncedSearch value={filters.q} onCommit={(next) => set({ q: next })} />
        <Button type="button" variant="outline" size="sm" className="h-11" aria-expanded={expanded} aria-controls="group-activity-filters" onClick={() => setExpanded((value) => !value)}><SlidersHorizontal />Filters{advancedCount > 0 ? <span className="text-xs tabular-nums">{advancedCount}</span> : null}</Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={filters.type} onValueChange={(next) => set({ type: (next ?? "all") as GroupFeedFilters["type"] })}>
          <SelectTrigger className="h-11 w-[10rem]" aria-label="Filter by entry type">
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
        <p className="text-xs text-muted-foreground" role="status">{active ? `${shown} of ${counts} entries` : `${counts} ${counts === 1 ? "entry" : "entries"}`}</p>
        {active ? <Button type="button" variant="link" size="sm" onClick={reset}><FilterX />Clear filters</Button> : null}
      </div>
      {expanded ? <div id="group-activity-filters" className="grid grid-cols-1 gap-3 rounded-xl bg-secondary/50 p-3 sm:grid-cols-2">
        <div className="grid gap-1.5"><span className="text-xs font-medium text-muted-foreground">Category</span>
        <Select value={filters.category || "any"} onValueChange={(next) => set({ category: next === "any" ? "" : (next ?? "") })}>
          <SelectTrigger className="h-11 w-full" aria-label="Filter by category">
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
        </div>
        <div className="grid gap-1.5"><span className="text-xs font-medium text-muted-foreground">Member</span>
        <Select value={filters.member || "any"} onValueChange={(next) => set({ member: next === "any" ? "" : (next ?? "") })}>
          <SelectTrigger className="h-11 w-full" aria-label="Filter by member">
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
        </div>
        <div className="grid min-w-0 gap-1.5"><span className="text-xs font-medium text-muted-foreground">From</span><DatePicker value={filters.from} onChange={(from) => set({ from })} max={filters.to || undefined} clearable placeholder="Any start date" aria-label="Filter from date" /></div>
        <div className="grid min-w-0 gap-1.5"><span className="text-xs font-medium text-muted-foreground">To</span><DatePicker value={filters.to} onChange={(to) => set({ to })} min={filters.from || undefined} clearable placeholder="Any end date" aria-label="Filter to date" /></div>
      </div> : null}
      {active ? <p className="text-xs leading-5 text-muted-foreground">{[...describeGroupFeedFilters(filters), ...(filters.member ? [`with ${group.members.find((member) => member.id === filters.member)?.name ?? "selected member"}`] : [])].join(" · ")}</p> : null}
    </div>
  );
}
