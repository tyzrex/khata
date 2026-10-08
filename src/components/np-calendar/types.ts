import type { ConvertedDate } from "./core/date-conversion/conversions";

export type { ConvertedDate };
export type CalendarType = "AD" | "BS";
export type Locale = "np" | "en";

export interface DisabledDays {
  weekDays: number[];
  days: string[];
  past: boolean;
  yearSwitch: boolean;
  /**
   * Blocks every day strictly before this date. AD ISO `"YYYY-MM-DD"` — note this
   * is a *different* format from `days`, whose entries are unpadded `"YYYY-M-D"`
   * calendar keys.
   *
   * Exists because a bounded-but-open-ended lower bound cannot be expressed as a
   * `days` list (that would need infinitely many entries) and `past` only ever
   * means "before today". Used for windows like the retroactive time-request
   * limit, where the cutoff is some number of days back rather than today.
   */
  minDate?: string;
  /**
   * Blocks every day strictly after this date. AD ISO `"YYYY-MM-DD"`, same format
   * and same "unbounded upper bound can't be a `days` list" reasoning as
   * `minDate`. Used for windows like "no later than today" where the ceiling is a
   * moving date rather than a fixed one.
   */
  maxDate?: string;
}

export interface CalendarStyles {
  containerClass?: string;
  headerClass?: string;
  switcherClass?: string;
  dayClass?: string;
  selectedDayClass?: string;
  todayClass?: string;
}

export interface MonthYearChange {
  year: number;
  month: number;
}

/** Two-endpoint selection, both ends nullable while a range is mid-pick. */
export interface DateRange {
  start: Date | null;
  end: Date | null;
}

export interface SelectionCalendarProps {
  calendarType?: CalendarType;
  defaultCalendarType?: CalendarType;
  selectedDate?: Date;
  defaultSelectedDate?: Date;
  /**
   * The committed selection in `mode="single"`. Month/year navigation moves the
   * visible month (`selectedDate`), so pass this to keep the highlight on the
   * real value (or `null` for none) instead of the day-of-month being browsed.
   */
  value?: Date | null;
  disabledDays?: DisabledDays;
  disablePastDates?: boolean;
  locale?: Locale;
  showAllDays?: boolean;
  compact?: boolean;
  disableYearNavigation?: boolean;
  className?: string;
  styles?: CalendarStyles;
  /**
   * "single" (default) keeps the existing one-day-click behavior. "range"
   * switches to two-endpoint selection: the first click sets the start, the
   * second sets the end (clicking before the start swaps them and restarts),
   * and days strictly between the two endpoints render as "in range" via
   * `CalendarGrid`'s `data-in-range` attribute.
   */
  mode?: "single" | "range";
  /** Uncontrolled initial range for `mode="range"` (e.g. reopening on an edit form). */
  defaultSelectedRange?: DateRange;
  /** Fires on every range-mode click with the updated `{ start, end }`. */
  onRangeChange?: (range: DateRange) => void;
  onDateSelected?: (date: ConvertedDate) => void;
  onCalendarTypeChange?: (type: CalendarType) => void;
  onMonthYearChange?: (info: MonthYearChange) => void;
  /**
   * Extra day markers (org holidays, employee off-dates) — shown with a subtle
   * highlight + tooltip, but unlike `disabledDays` they never block selection
   * (a leave request can legitimately span them). Keyed by `"YYYY-M-D"` AD, the
   * same unpadded format `disabledDays.days` uses.
   */
  markedDates?: Record<string, string>;
  /** Weekly recurring marked days (`Date#getDay()` indices, 0 = Sunday), e.g. the
   * employee's weekly off-day(s) from the backend. Same non-blocking marking as
   * `markedDates`. When provided, also drives weekend (red) styling on the grid
   * instead of the hardcoded Sat+Sun default. */
  markedWeekDays?: number[];
  /** Tooltip label for `markedWeekDays` matches. Defaults to "Weekly off". */
  markedWeekDaysLabel?: string;
}
