"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { DatePicker, DateRangePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { addDays, type DateRange, type RangeKind } from "@/lib/dashboard";

const kinds: { id: RangeKind; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

const presets = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

/**
 * Everything for moving through time: period kind, step back and forward,
 * jump to today, pick a date, or type a custom range.
 */
export function DateRangeBar({
  kind,
  label,
  today,
  anchor,
  custom,
  canNext,
  onKind,
  onShift,
  onAnchor,
  onCustom,
}: {
  kind: RangeKind;
  label: string;
  today: string;
  anchor: string;
  custom: DateRange;
  canNext: boolean;
  onKind: (kind: RangeKind) => void;
  onShift: (direction: -1 | 1) => void;
  onAnchor: (iso: string) => void;
  onCustom: (range: DateRange) => void;
}) {
  const stepping = kind === "week" || kind === "month" || kind === "year";
  const onToday = anchor === today;

  return (
    <div className="flex w-full flex-col gap-2 xl:w-auto xl:items-end">
      <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:flex-nowrap">
        <div className="flex h-10 w-full items-center rounded-xl bg-card p-1 shadow-card sm:w-auto" role="group" aria-label="Period">
          {kinds.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === kind}
              onClick={() => onKind(item.id)}
              className={
                item.id === kind
                  ? "h-full min-w-0 flex-1 rounded-md bg-primary px-2 text-[13px] font-semibold whitespace-nowrap text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none sm:px-3.5"
                  : "h-full min-w-0 flex-1 rounded-md px-2 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors duration-200 outline-none hover:bg-secondary hover:text-display focus-visible:ring-2 focus-visible:ring-ring sm:flex-none sm:px-3.5"
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        {stepping ? (
          <div className="flex h-10 min-w-0 flex-1 items-center rounded-xl bg-card p-1 shadow-card sm:flex-none">
            <Button type="button" variant="ghost" size="icon-sm" className="size-8 min-h-0 rounded-md px-0 hover:bg-secondary" aria-label="Previous period" onClick={() => onShift(-1)}>
              <ChevronLeft />
            </Button>
            <span className="deva min-w-0 flex-1 truncate px-1 text-center text-[13px] font-semibold text-display sm:min-w-32">{label}</span>
            <Button type="button" variant="ghost" size="icon-sm" className="size-8 min-h-0 rounded-md px-0 hover:bg-secondary" aria-label="Next period" disabled={!canNext} onClick={() => onShift(1)}>
              <ChevronRight />
            </Button>
          </div>
        ) : (
          <span className="deva flex h-10 items-center rounded-xl bg-card px-4 text-[13px] font-semibold text-display shadow-card">{label}</span>
        )}

        {stepping ? (
          <Button type="button" variant="outline" size="sm" className="h-10 bg-card shadow-card" disabled={onToday} onClick={() => onAnchor(today)}>
            Today
          </Button>
        ) : null}

        {stepping ? <DatePicker variant="icon" className="shadow-card" value={anchor} onChange={(iso) => iso && onAnchor(iso)} aria-label="Jump to a date" /> : null}
      </div>

      {kind === "custom" ? (
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={custom} max={today} onChange={onCustom} aria-label="Pick a date range" />
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onCustom({ start: addDays(today, -(preset.days - 1)), end: today })}
              className="h-9 rounded-xl bg-card px-3.5 text-[13px] font-medium text-display shadow-card transition-colors duration-200 hover:bg-secondary"
            >
              Last {preset.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
