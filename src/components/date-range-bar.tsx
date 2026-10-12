"use client";

import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { DatePicker, DateRangePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { addDays, type DateRange, type RangeKind } from "@/lib/dashboard";

/** `short` is the desktop segmented button, `label` the sheet row, `hint` why you'd pick it. */
const kinds: { id: RangeKind; short: string; label: string; hint: string }[] = [
  { id: "week", short: "Week", label: "This week", hint: "Seven days" },
  { id: "month", short: "Month", label: "This month", hint: "The calendar month" },
  { id: "year", short: "Year", label: "This year", hint: "Twelve months" },
  { id: "all", short: "All time", label: "All time", hint: "Everything in your book" },
];

const presets = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

/**
 * Everything for moving through time: period kind, step back and forward,
 * jump to today, pick a date, or type a custom range.
 *
 * A phone cannot afford two rows of controls above the fold — five period buttons
 * plus a stepper, a Today button and a calendar icon came to 150px, a third of the
 * screen, before a single number was on it. So under `lg` this collapses to one
 * control: the period label itself, which already says where you are. Tapping it
 * opens a sheet holding everything the desktop bar holds, and the sheet closes on
 * a choice instead of leaving two rows of chrome behind. The desktop bar is fine as
 * it is and is left alone.
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
    <>
      <div className="hidden w-full flex-col gap-2 lg:flex xl:w-auto xl:items-end">
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
              {item.short}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={kind === "custom"}
            onClick={() => onKind("custom")}
            className={
              kind === "custom"
                ? "h-full min-w-0 flex-1 rounded-md bg-primary px-2 text-[13px] font-semibold whitespace-nowrap text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none sm:px-3.5"
                : "h-full min-w-0 flex-1 rounded-md px-2 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors duration-200 outline-none hover:bg-secondary hover:text-display focus-visible:ring-2 focus-visible:ring-ring sm:flex-none sm:px-3.5"
            }
          >
            Custom
          </button>
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
                {preset.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <MobilePeriodSheet
        kind={kind}
        label={label}
        today={today}
        anchor={anchor}
        custom={custom}
        canNext={canNext}
        onKind={onKind}
        onShift={onShift}
        onAnchor={onAnchor}
        onCustom={onCustom}
      />
    </>
  );
}

/** The one control a phone gets: the period label, which opens everything else. */
function MobilePeriodSheet({
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
  const [open, setOpen] = useState(false);
  const stepping = kind === "week" || kind === "month" || kind === "year";

  function close() {
    setOpen(false);
  }

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex h-11 w-full items-center gap-2 rounded-xl bg-card px-4 text-left text-[15px] font-semibold text-display shadow-card transition-colors duration-200 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CalendarRange className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
        <DrawerContent className="max-h-[90dvh]">
          <DrawerHeader>
            <DrawerTitle>Period</DrawerTitle>
            <DrawerDescription className="sr-only">Choose which period the dashboard shows</DrawerDescription>
          </DrawerHeader>

          <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {stepping ? (
              <div className="mb-4 flex items-center gap-2">
                <Button type="button" variant="secondary" size="icon" className="size-11 shrink-0 rounded-xl" aria-label="Previous period" onClick={() => onShift(-1)}>
                  <ChevronLeft />
                </Button>
                <span className="deva min-w-0 flex-1 truncate text-center text-[15px] font-semibold text-display">{label}</span>
                <Button type="button" variant="secondary" size="icon" className="size-11 shrink-0 rounded-xl" aria-label="Next period" disabled={!canNext} onClick={() => onShift(1)}>
                  <ChevronRight />
                </Button>
              </div>
            ) : null}

            <ul className="grid gap-1.5">
              {kinds.map((item) => {
                const active = item.id === kind;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        onKind(item.id);
                        close();
                      }}
                      className={
                        active
                          ? "flex w-full items-center gap-3 rounded-xl bg-accent px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          : "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors duration-200 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
                      }
                    >
                      <span className={active ? "text-sm font-semibold text-accent-foreground" : "text-sm font-medium text-display"}>{item.label}</span>
                      <span className="ml-auto text-[13px] text-muted-foreground">{item.hint}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {stepping ? (
              <div className="mt-4 flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 flex-1 rounded-xl"
                  disabled={anchor === today}
                  onClick={() => {
                    onAnchor(today);
                    close();
                  }}
                >
                  Jump to today
                </Button>
                <DatePicker value={anchor} onChange={(iso) => iso && onAnchor(iso)} aria-label="Jump to a date" className="h-11 flex-1" />
              </div>
            ) : null}

            <div className="mt-4 border-t border-border pt-4">
              <p className="label mb-2">Custom range</p>
              <div className="flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      onCustom({ start: addDays(today, -(preset.days - 1)), end: today });
                      close();
                    }}
                    className="h-10 rounded-xl bg-secondary px-4 text-[13px] font-medium text-display transition-colors duration-200 hover:bg-muted"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="mt-2">
                <DateRangePicker
                  value={custom}
                  max={today}
                  onChange={(range) => {
                    onCustom(range);
                    onKind("custom");
                    close();
                  }}
                  aria-label="Pick a date range"
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <DrawerFooter className="px-4 pt-1 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" className="h-11 w-full rounded-xl" onClick={close}>
              Close
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
