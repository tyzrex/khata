"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Locale } from "../types";

interface Props {
  monthLabel: string;
  locale: Locale;
  compact: boolean;
  disableYearNavigation: boolean;
  headerClass?: string;
  isNavDisabled: (dir: "prev" | "next", type: "month" | "year") => boolean;
  onPrevYear: () => void;
  onPrevMonth: () => void;
  onToday: () => void;
  onNextMonth: () => void;
  onNextYear: () => void;
  /** When provided, the title becomes month + year dropdowns for quick jumps. */
  picker?: {
    monthOptions: { value: number; label: string }[];
    yearOptions: number[];
    currentMonth: number;
    currentYear: number;
    yearLabel: (y: number) => string;
    onSelectMonth: (m: number) => void;
    onSelectYear: (y: number) => void;
  };
}

const Chevron = ({ d }: { d: string }) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);
const LEFT = "M15 18l-6-6 6-6";
const RIGHT = "M9 18l6-6-6-6";
const LEFT2 = "M11 17l-5-5 5-5 M18 17l-5-5 5-5";
const RIGHT2 = "M13 17l5-5-5-5 M6 17l5-5-5-5";

export function CalendarHeader(p: Props) {
  return (
    <div className={`hpc-header ${p.headerClass ?? ""}`} data-compact={p.compact}>
      <div className="hpc-header-group" data-side="prev">
        {!p.disableYearNavigation && (
          <button
            type="button"
            className="hpc-nav-btn"
            aria-label="Previous Year"
            disabled={p.isNavDisabled("prev", "year")}
            onClick={p.onPrevYear}
          >
            <Chevron d={LEFT2} />
          </button>
        )}
        <button
          type="button"
          className="hpc-nav-btn"
          aria-label="Previous Month"
          disabled={p.isNavDisabled("prev", "month")}
          onClick={p.onPrevMonth}
        >
          <Chevron d={LEFT} />
        </button>
      </div>

      <div className="hpc-header-center">
        {p.picker ? (
          <div className="hpc-picker">
            <Select
              value={String(p.picker.currentMonth)}
              onValueChange={(value) => p.picker!.onSelectMonth(Number(value))}
            >
              <SelectTrigger
                size="sm"
                className="hpc-picker-trigger hpc-month-trigger"
                aria-label="Month"
              >
                <SelectValue>
                  {p.picker.monthOptions.find((option) => option.value === p.picker!.currentMonth)
                    ?.label ?? ""}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start" className="hpc-picker-content max-h-48">
                {p.picker.monthOptions.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(p.picker.currentYear)}
              onValueChange={(value) => p.picker!.onSelectYear(Number(value))}
            >
              <SelectTrigger
                size="sm"
                className="hpc-picker-trigger hpc-year-trigger"
                aria-label="Year"
              >
                <SelectValue>{p.picker.yearLabel(p.picker.currentYear)}</SelectValue>
              </SelectTrigger>
              <SelectContent align="end" className="hpc-picker-content max-h-48">
                {p.picker.yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)} className="justify-center pr-2 pl-2">
                    {p.picker!.yearLabel(y)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <h2 className="hpc-title">{p.monthLabel}</h2>
        )}
        <button
          type="button"
          className="hpc-today-btn"
          aria-label="Go to Today"
          onClick={p.onToday}
        >
          {p.locale === "np" ? "आज" : "Today"}
        </button>
      </div>

      <div className="hpc-header-group" data-side="next">
        <button
          type="button"
          className="hpc-nav-btn"
          aria-label="Next Month"
          disabled={p.isNavDisabled("next", "month")}
          onClick={p.onNextMonth}
        >
          <Chevron d={RIGHT} />
        </button>
        {!p.disableYearNavigation && (
          <button
            type="button"
            className="hpc-nav-btn"
            aria-label="Next Year"
            disabled={p.isNavDisabled("next", "year")}
            onClick={p.onNextYear}
          >
            <Chevron d={RIGHT2} />
          </button>
        )}
      </div>
    </div>
  );
}
