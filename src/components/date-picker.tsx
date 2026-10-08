"use client";

import { CalendarDays } from "lucide-react";
import { useMemo, useState } from "react";
import { SelectionCalendar, type ConvertedDate, type DateRange as CalendarRange } from "@/components/np-calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDateStyle } from "@/components/use-date-style";
import { formatFullDate } from "@/lib/format";
import { parseIso, toIso } from "@/lib/nepali-date";
import { cn } from "cn";

type DayRange = { start: string; end: string };

type Bounds = { min?: string; max?: string };

type Shared = Bounds & {
  id?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

function toDate(iso: string) {
  const { year, month, day } = parseIso(iso);
  return new Date(year, month - 1, day);
}

function fromDate(date: Date) {
  return toIso({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
}

function fromConverted(day: ConvertedDate) {
  return toIso({ year: day.year_ad, month: day.month_ad, day: day.date_ad });
}

const triggerClass =
  "@container flex h-11 w-full min-w-0 items-center gap-3 rounded-xl bg-secondary px-4 text-left text-sm font-medium text-display outline-none transition-colors duration-200 hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-popup-open:ring-2 data-popup-open:ring-ring";

function Surface({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SelectionCalendar>, "locale" | "compact" | "defaultCalendarType" | "className"> & { className?: string }) {
  const { style } = useDateStyle();
  return (
    <SelectionCalendar
      {...props}
      locale={style.script}
      defaultCalendarType={style.calendar}
      compact={false}
      className={cn("w-[21rem] max-w-[calc(100vw-1.5rem)] rounded-3xl border-0 shadow-none", className)}
    />
  );
}

function disabledFor({ min, max }: Bounds) {
  return { weekDays: [], days: [], past: false, yearSwitch: false, minDate: min, maxDate: max };
}

/**
 * Pick one day. Reads and writes AD ISO strings (what the database stores); the
 * calendar and the label follow the user's BS/AD preference.
 */
export function DatePicker({
  value,
  onChange,
  variant = "field",
  placeholder = "Pick a date",
  clearable = false,
  min,
  max,
  id,
  className,
  disabled,
  "aria-label": ariaLabel,
}: Shared & {
  value: string;
  onChange: (iso: string) => void;
  /** `field` fills a form row; `icon` is a round button for toolbars. */
  variant?: "field" | "icon";
  /** Shown while `value` is empty. */
  placeholder?: string;
  /** Offer a Clear button; it reports an empty string. */
  clearable?: boolean;
}) {
  const { style } = useDateStyle();
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => (value ? toDate(value) : null), [value]);
  const disabledDays = useMemo(() => disabledFor({ min, max }), [min, max]);
  const other = style.calendar === "BS" ? "AD" : "BS";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {variant === "icon" ? (
        <PopoverTrigger
          disabled={disabled}
          aria-label={ariaLabel ?? "Pick a date"}
          render={<Button type="button" variant="outline" size="icon" className={cn("bg-card", className)} />}
        >
          <CalendarDays />
        </PopoverTrigger>
      ) : (
        <PopoverTrigger id={id} disabled={disabled} aria-label={ariaLabel} className={cn(triggerClass, className)}>
          <CalendarDays className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{value ? formatFullDate(value, style) : <span className="font-normal text-muted-foreground">{placeholder}</span>}</span>
          {value ? (
            <span className="hidden shrink-0 text-xs font-normal text-muted-foreground @min-[300px]:block">
              {other} {formatFullDate(value, { calendar: other, script: style.script })}
            </span>
          ) : null}
        </PopoverTrigger>
      )}
      <PopoverContent align={variant === "icon" ? "end" : "start"}>
        <Surface
          defaultSelectedDate={selected ?? undefined}
          value={selected}
          disabledDays={disabledDays}
          onDateSelected={(day) => {
            onChange(fromConverted(day));
            setOpen(false);
          }}
        />
        {clearable && value ? (
          <div className="px-4 pb-4">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear date
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** Pick a first and last day. Closes once both ends are chosen. */
export function DateRangePicker({
  value,
  onChange,
  min,
  max,
  id,
  className,
  disabled,
  "aria-label": ariaLabel,
}: Shared & {
  value: DayRange;
  onChange: (range: DayRange) => void;
}) {
  const { style } = useDateStyle();
  const [open, setOpen] = useState(false);
  const disabledDays = useMemo(() => disabledFor({ min, max }), [min, max]);
  const initial = useMemo(() => ({ start: toDate(value.start), end: toDate(value.end) }), [value.start, value.end]);

  function commit(range: CalendarRange) {
    if (!range.start || !range.end) return;
    onChange({ start: fromDate(range.start), end: fromDate(range.end) });
    setOpen(false);
  }

  const label =
    value.start === value.end
      ? formatFullDate(value.start, style)
      : `${formatFullDate(value.start, style)} – ${formatFullDate(value.end, style)}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-label={ariaLabel ?? "Pick a date range"}
        className={cn(triggerClass, "h-11 w-auto rounded-xl bg-card px-5 text-sm hover:bg-card/80", className)}
      >
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent>
        <Surface
          mode="range"
          defaultSelectedDate={initial.start}
          defaultSelectedRange={initial}
          disabledDays={disabledDays}
          onRangeChange={commit}
        />
        <p className="px-5 pb-4 text-center text-xs text-muted-foreground">Pick the first day, then the last.</p>
      </PopoverContent>
    </Popover>
  );
}
