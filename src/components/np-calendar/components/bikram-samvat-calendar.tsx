// src/components/BikramSamvatCalendar.tsx
"use client";
import { type ConvertedDate } from "../core/date-conversion/conversions";
import { areDatesSame } from "../core/date-conversion/date";
import { useCalendarMonth } from "../hooks/use-calendar-month";
import { CalendarGrid } from "./calendar-grid";
import { CalendarHeader } from "./calendar-header";
import { buildBsYearOptions } from "../lib/bs-year-options";
import type { CalendarStyles, DisabledDays, Locale, MonthYearChange } from "../types";

const BS_MONTHS_EN = [
  "Baishakh",
  "Jestha",
  "Ashadh",
  "Shrawan",
  "Bhadra",
  "Ashwin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
];
const BS_MONTHS_NP = [
  "बैशाख",
  "जेठ",
  "असार",
  "साउन",
  "भदौ",
  "असोज",
  "कात्तिक",
  "मंसिर",
  "पुष",
  "माघ",
  "फागुन",
  "चैत",
];
const NP_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];
const toNpDigits = (n: number) => String(n).replace(/\d/g, (d) => NP_DIGITS[Number(d)]);
interface Props {
  selectedDate: Date;
  /** Committed single selection; `undefined` falls back to `selectedDate`. */
  selectedValue?: Date | null;
  onDateChange: (date: Date) => void;
  disabledDays: DisabledDays;
  locale: Locale;
  showAllDays: boolean;
  compact: boolean;
  disableYearNavigation: boolean;
  styles: CalendarStyles;
  className?: string;
  onDateSelected?: (d: ConvertedDate) => void;
  onMonthYearChange?: (info: MonthYearChange) => void;
  markedDates?: Record<string, string>;
  markedWeekDays?: number[];
  markedWeekDaysLabel?: string;
  /** Range-mode endpoints (undefined/null in single-select mode). Both
   * endpoints render with the normal "selected" style; days strictly between
   * them render with the softer "in range" style. */
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
}

export function BikramSamvatCalendar(p: Props) {
  const m = useCalendarMonth({
    selectedDate: p.selectedDate,
    showAllDays: p.showAllDays,
    disabledDays: p.disabledDays,
    locale: p.locale,
    disableYearNavigation: p.disableYearNavigation,
  });

  function emitMY(date: Date) {
    const bs = m.bsOf(date);
    p.onMonthYearChange?.({ year: bs.year_bs, month: bs.month_bs });
  }

  function handleDayClick(day: ConvertedDate) {
    p.onDateChange(new Date(day.year_ad, day.month_ad - 1, day.date_ad));
    p.onDateSelected?.(day);
  }

  function isSelected(day: ConvertedDate): boolean {
    const d = new Date(day.year_ad, day.month_ad - 1, day.date_ad);
    const committed = p.selectedValue === undefined ? p.selectedDate : p.selectedValue;
    if (committed && areDatesSame(d, committed)) return true;
    if (p.rangeStart && areDatesSame(d, p.rangeStart)) return true;
    if (p.rangeEnd && areDatesSame(d, p.rangeEnd)) return true;
    return false;
  }

  function isInRange(day: ConvertedDate): boolean {
    if (!p.rangeStart || !p.rangeEnd) return false;
    const t = new Date(day.year_ad, day.month_ad - 1, day.date_ad).getTime();
    const lo = Math.min(p.rangeStart.getTime(), p.rangeEnd.getTime());
    const hi = Math.max(p.rangeStart.getTime(), p.rangeEnd.getTime());
    return t > lo && t < hi;
  }

  function isDateDisabled(day: ConvertedDate): boolean {
    const year = day.year_ad,
      month = day.month_ad - 1,
      dd = day.date_ad;
    const key = `${year}-${month + 1}-${dd}`;
    const inDays = p.disabledDays?.days?.includes(key);
    const inWeek = p.disabledDays?.weekDays?.includes(new Date(year, month, dd).getDay());
    const isPast =
      p.disabledDays?.past && new Date(year, month, dd) < new Date(new Date().setHours(0, 0, 0, 0));
    // Compared in AD (every BS cell carries its AD equivalent) so the BS grid greys
    // out exactly the same days as the AD grid. See the AD sibling for why this is a
    // padded-string compare rather than a Date compare.
    const beforeMin = Boolean(
      p.disabledDays?.minDate &&
      `${year}-${String(month + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}` <
        p.disabledDays.minDate,
    );
    const afterMax = Boolean(
      p.disabledDays?.maxDate &&
      `${year}-${String(month + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}` >
        p.disabledDays.maxDate,
    );
    return Boolean(inDays || inWeek || isPast || beforeMin || afterMax);
  }

  function getMarker(day: ConvertedDate): string | null {
    const year = day.year_ad,
      month = day.month_ad - 1,
      dd = day.date_ad;
    const key = `${year}-${month + 1}-${dd}`;
    const dateLabel = p.markedDates?.[key];
    if (dateLabel) return dateLabel;
    const weekday = new Date(year, month, dd).getDay();
    if (p.markedWeekDays?.includes(weekday)) return p.markedWeekDaysLabel ?? "Weekly off";
    return null;
  }

  const bsMonthNames = p.locale === "np" ? BS_MONTHS_NP : BS_MONTHS_EN;
  const currentMonth = m.selectedDay.month_bs;
  const currentYear = m.selectedDay.year_bs;
  const currentBsYear = m.bsOf(new Date()).year_bs;
  const yearOptions = buildBsYearOptions(currentYear, currentBsYear);
  const picker = {
    monthOptions: bsMonthNames.map((label, i) => ({ value: i + 1, label })),
    yearOptions,
    currentMonth,
    currentYear,
    yearLabel: (y: number) => (p.locale === "np" ? toNpDigits(y) : String(y)),
    onSelectMonth: (mm: number) => {
      const d = m.jumpTo(currentYear, mm);
      p.onDateChange(d);
      emitMY(d);
    },
    onSelectYear: (yy: number) => {
      const d = m.jumpTo(yy, currentMonth);
      p.onDateChange(d);
      emitMY(d);
    },
  };

  return (
    <div className={`hpc-calendar ${p.className ?? ""}`}>
      <CalendarHeader
        picker={picker}
        monthLabel={m.monthLabel}
        locale={p.locale}
        compact={p.compact}
        disableYearNavigation={p.disableYearNavigation}
        headerClass={p.styles.headerClass}
        isNavDisabled={m.isNavDisabled}
        onPrevYear={() => {
          const d = m.switchYear("previous");
          p.onDateChange(d);
          emitMY(d);
        }}
        onPrevMonth={() => {
          const d = m.switchMonth("previous");
          p.onDateChange(d);
          emitMY(d);
        }}
        onToday={() => {
          const d = new Date();
          p.onDateChange(d);
          emitMY(d);
        }}
        onNextMonth={() => {
          const d = m.switchMonth("next");
          p.onDateChange(d);
          emitMY(d);
        }}
        onNextYear={() => {
          const d = m.switchYear("next");
          p.onDateChange(d);
          emitMY(d);
        }}
      />
      <CalendarGrid
        days={m.days}
        locale={p.locale}
        compact={p.compact}
        styles={p.styles}
        getPrimary={(d) => (p.locale === "en" ? String(d.date_bs) : d.date_bs_np)}
        getSecondary={(d) => String(d.date_ad)}
        isOtherMonth={(d) => d.month_bs !== m.selectedDay.month_bs}
        isSelected={isSelected}
        isDisabled={isDateDisabled}
        isInRange={isInRange}
        getMarker={getMarker}
        markedWeekDays={p.markedWeekDays}
        onSelect={handleDayClick}
      />
    </div>
  );
}
