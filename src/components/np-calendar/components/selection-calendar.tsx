// src/components/selection-calendar.tsx
"use client";
import { useMemo } from "react";
import { useControllableState } from "../hooks/use-controllable-state";
import { BikramSamvatCalendar } from "./bikram-samvat-calendar";
import { GregorianCalendar } from "./gregorian-calendar";
import { CalendarTypeSwitch } from "./calendar-type-switch";
import type {
  CalendarType,
  ConvertedDate,
  DateRange,
  DisabledDays,
  SelectionCalendarProps,
} from "../types";

const EMPTY_RANGE: DateRange = { start: null, end: null };

const EMPTY_DISABLED: DisabledDays = { weekDays: [], days: [], past: false, yearSwitch: false };

function getPastDatesArray(): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out: string[] = [];
  const startYear = today.getFullYear() - 1;
  const endYear = today.getFullYear();
  for (let year = startYear; year <= endYear; year++) {
    for (let month = 1; month <= 12; month++) {
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month - 1, day);
        d.setHours(0, 0, 0, 0);
        if (d < today) out.push(`${year}-${month}-${day}`);
      }
    }
  }
  return out;
}

export function SelectionCalendar({
  calendarType,
  defaultCalendarType = "BS",
  selectedDate,
  defaultSelectedDate,
  value,
  disabledDays = EMPTY_DISABLED,
  disablePastDates = false,
  locale = "np",
  showAllDays = false,
  compact = true,
  disableYearNavigation = false,
  className = "",
  styles = {},
  mode = "single",
  defaultSelectedRange,
  onRangeChange,
  onDateSelected,
  onCalendarTypeChange,
  onMonthYearChange,
  markedDates,
  markedWeekDays,
  markedWeekDaysLabel,
}: SelectionCalendarProps) {
  const [type, setType] = useControllableState<CalendarType>({
    value: calendarType,
    defaultValue: defaultCalendarType,
    onChange: onCalendarTypeChange,
  });

  const [date, setDate] = useControllableState<Date>({
    value: selectedDate,
    defaultValue: defaultSelectedDate ?? new Date(),
  });

  const [range, setRange] = useControllableState<DateRange>({
    defaultValue: defaultSelectedRange ?? EMPTY_RANGE,
    onChange: onRangeChange,
  });

  /**
   * Range-mode click handler: 1st click (or clicking again after a completed
   * range) starts a new range; the 2nd click completes it — clicking before
   * the current start swaps the two endpoints instead of producing an
   * inverted range.
   */
  function handleRangeDaySelected(d: ConvertedDate) {
    const clicked = new Date(d.year_ad, d.month_ad - 1, d.date_ad);
    if (!range.start || range.end) {
      setRange({ start: clicked, end: null });
      return;
    }
    if (clicked.getTime() < range.start.getTime()) {
      setRange({ start: clicked, end: range.start });
      return;
    }
    setRange({ start: range.start, end: clicked });
  }

  const enhancedDays = useMemo(
    () => (disablePastDates ? [...disabledDays.days, ...getPastDatesArray()] : disabledDays.days),
    [disablePastDates, disabledDays.days],
  );

  const effectiveDisabled: DisabledDays = {
    weekDays: disabledDays.weekDays,
    days: enhancedDays,
    past: disabledDays.past || disablePastDates,
    yearSwitch: disabledDays.yearSwitch || disablePastDates,
    minDate: disabledDays.minDate,
    maxDate: disabledDays.maxDate,
  };

  const shared = {
    selectedDate: date,
    selectedValue: mode === "single" ? value : undefined,
    onDateChange: setDate,
    disabledDays: effectiveDisabled,
    locale,
    showAllDays,
    compact,
    disableYearNavigation,
    styles,
    onDateSelected: mode === "range" ? handleRangeDaySelected : onDateSelected,
    onMonthYearChange,
    markedDates,
    markedWeekDays,
    markedWeekDaysLabel,
    rangeStart: mode === "range" ? range.start : undefined,
    rangeEnd: mode === "range" ? range.end : undefined,
  };

  return (
    <div
      className={`hpc ${compact ? "hpc-compact" : ""} ${styles.containerClass ?? ""} ${className}`}
    >
      <div className="hpc-switch-bar">
        <CalendarTypeSwitch value={type} onChange={setType} switcherClass={styles.switcherClass} />
      </div>
      {type === "BS" ? <BikramSamvatCalendar {...shared} /> : <GregorianCalendar {...shared} />}
    </div>
  );
}
