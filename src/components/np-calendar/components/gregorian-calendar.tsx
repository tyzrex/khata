// src/components/GregorianCalendar.tsx
"use client";
import { useMemo, useState } from "react";
import { Calendar, type ConvertedDate } from "../core/date-conversion/conversions";
import { areDatesSame } from "../core/date-conversion/date";
import { CalendarGrid } from "./calendar-grid";
import { CalendarHeader } from "./calendar-header";
import type { CalendarStyles, DisabledDays, Locale, MonthYearChange } from "../types";

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
  /** Range-mode endpoints — see `BikramSamvatCalendar`'s `Props` for details. */
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
}

export function GregorianCalendar(p: Props) {
  const [calendar] = useState(() => new Calendar());

  const year = p.selectedDate.getFullYear();
  const month = p.selectedDate.getMonth(); // 0-based

  // Build a true Gregorian month grid: leading blanks for the first weekday,
  // then days 1..daysInMonth. (The BS grid is wrong for AD — it starts mid-month.)
  const days = useMemo<(ConvertedDate | null)[]>(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const cells: (ConvertedDate | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(calendar.convert_date_using_ad(year, month + 1, d));
    }
    // Pad to a fixed 6-week grid so AD months don't jump height vs BS.
    while (cells.length < 42) cells.push(null);
    return cells;
  }, [calendar, year, month]);

  const monthLabel = `${calendar.convert_date_using_ad(year, month + 1, 1).month_ad_en} ${year}`;

  function stepMonth(delta: number): Date {
    const d = new Date(p.selectedDate);
    d.setMonth(d.getMonth() + delta);
    return d;
  }
  function stepYear(delta: number): Date {
    const d = new Date(p.selectedDate);
    d.setFullYear(d.getFullYear() + delta);
    return d;
  }
  function emitMY(date: Date) {
    const bs = calendar.convert_date_using_ad(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
    );
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
    const y = day.year_ad,
      mo = day.month_ad - 1,
      dd = day.date_ad;
    const key = `${y}-${mo + 1}-${dd}`;
    const inDays = p.disabledDays?.days?.includes(key);
    const inWeek = p.disabledDays?.weekDays?.includes(new Date(y, mo, dd).getDay());
    const isPast =
      p.disabledDays?.past && new Date(y, mo, dd) < new Date(new Date().setHours(0, 0, 0, 0));
    // Zero-padded ISO strings sort chronologically, so a plain `<` is correct here.
    // Avoids `new Date("YYYY-MM-DD")`, which parses as UTC midnight and can land on
    // the previous local day in negative-offset zones.
    const beforeMin = Boolean(
      p.disabledDays?.minDate &&
      `${y}-${String(mo + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}` <
        p.disabledDays.minDate,
    );
    const afterMax = Boolean(
      p.disabledDays?.maxDate &&
      `${y}-${String(mo + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}` >
        p.disabledDays.maxDate,
    );
    return Boolean(inDays || inWeek || isPast || beforeMin || afterMax);
  }

  function getMarker(day: ConvertedDate): string | null {
    const y = day.year_ad,
      mo = day.month_ad - 1,
      dd = day.date_ad;
    const key = `${y}-${mo + 1}-${dd}`;
    const dateLabel = p.markedDates?.[key];
    if (dateLabel) return dateLabel;
    const weekday = new Date(y, mo, dd).getDay();
    if (p.markedWeekDays?.includes(weekday)) return p.markedWeekDaysLabel ?? "Weekly off";
    return null;
  }

  // AD-grid navigation disabling (ported from the Svelte GregorianCalendar).
  function isNavDisabled(direction: "prev" | "next", type: "month" | "year"): boolean {
    if (!p.disabledDays?.past && !p.disabledDays?.yearSwitch) return false;
    if (direction === "next") return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayY = today.getFullYear();
    const todayM = today.getMonth();
    if (type === "month") {
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      return new Date(prevYear, prevMonth, 1) <= new Date(todayY, todayM, 1);
    }
    return new Date(year - 1, month, 1) <= new Date(todayY, todayM, 1);
  }

  return (
    <div className={`hpc-calendar ${p.className ?? ""}`}>
      <CalendarHeader
        monthLabel={monthLabel}
        locale={p.locale}
        compact={p.compact}
        disableYearNavigation={p.disableYearNavigation}
        headerClass={p.styles.headerClass}
        isNavDisabled={isNavDisabled}
        onPrevYear={() => {
          const d = stepYear(-1);
          p.onDateChange(d);
          emitMY(d);
        }}
        onPrevMonth={() => {
          const d = stepMonth(-1);
          p.onDateChange(d);
          emitMY(d);
        }}
        onToday={() => {
          const d = new Date();
          p.onDateChange(d);
          emitMY(d);
        }}
        onNextMonth={() => {
          const d = stepMonth(1);
          p.onDateChange(d);
          emitMY(d);
        }}
        onNextYear={() => {
          const d = stepYear(1);
          p.onDateChange(d);
          emitMY(d);
        }}
      />
      <CalendarGrid
        days={days}
        locale={p.locale}
        compact={p.compact}
        styles={p.styles}
        getPrimary={(d) => String(d.date_ad)}
        getSecondary={(d) => d.date_bs_np}
        isOtherMonth={() => false}
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
