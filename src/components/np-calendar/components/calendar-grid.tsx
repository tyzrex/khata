"use client";
import type { ConvertedDate } from "../core/date-conversion/conversions";
import { weekDaysTwoAlpha } from "../core/date-conversion/data";
import type { CalendarStyles, Locale } from "../types";

/** Nepal-default weekend when no employee off-days are supplied. */
const DEFAULT_WEEKEND_DAYS = [0, 6]; // Sunday, Saturday (`Date#getDay()`)

/**
 * Weekly off-day check. When the caller passes `markedWeekDays` (from the
 * employee's backend `weeklyOffDays`), those win — so a Fri+Sat employee no
 * longer sees Sunday painted red. Without them, Sat+Sun stays the default.
 */
function isWeeklyOff(weekday: number, markedWeekDays: number[] | undefined): boolean {
  const offs = markedWeekDays ?? DEFAULT_WEEKEND_DAYS;
  return offs.includes(weekday);
}

interface Props {
  days: (ConvertedDate | null)[];
  locale: Locale;
  compact: boolean;
  styles: CalendarStyles;
  getPrimary: (d: ConvertedDate) => string;
  getSecondary: (d: ConvertedDate) => string;
  isOtherMonth: (d: ConvertedDate) => boolean;
  isSelected: (d: ConvertedDate) => boolean;
  isDisabled: (d: ConvertedDate) => boolean;
  onSelect: (d: ConvertedDate) => void;
  /** Non-blocking marker (holiday / weekly off / off-date) for a cell, or
   * `null` when the day carries none. Returns the tooltip label to show. */
  getMarker?: (d: ConvertedDate) => string | null;
  /** Range-mode only: true for days strictly between the two picked
   * endpoints (the endpoints themselves are `isSelected`, not `isInRange`). */
  isInRange?: (d: ConvertedDate) => boolean;
  /**
   * Employee weekly off-days (`Date#getDay()` indices). When set, weekend
   * (red) styling follows these instead of hardcoded Sat+Sun, and the
   * conversion-layer `is_holiday` Saturday flag is ignored so it can't
   * paint days the employee actually works.
   */
  markedWeekDays?: number[];
}

export function CalendarGrid(p: Props) {
  const weekdays = weekDaysTwoAlpha[p.locale];
  const dynamicOffs = p.markedWeekDays !== undefined;
  return (
    <div className="hpc-grid-wrap" data-compact={p.compact}>
      <div className="hpc-weekrow" role="row">
        {weekdays.map((w: string, i: number) => (
          <div
            key={i}
            className="hpc-weekday"
            role="columnheader"
            data-weekend={isWeeklyOff(i, p.markedWeekDays)}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="hpc-grid" role="grid">
        {p.days.map((d, i) => {
          if (d === null) {
            return <div key={`blank-${i}`} className="hpc-day hpc-day--empty" aria-hidden="true" />;
          }
          const selected = p.isSelected(d);
          const disabled = p.isDisabled(d);
          const inRange = p.isInRange?.(d) ?? false;
          const userSelected =
            selected && p.styles.selectedDayClass ? p.styles.selectedDayClass : "";
          const userToday = d.is_today && p.styles.todayClass ? p.styles.todayClass : "";
          const marker = p.getMarker?.(d) ?? null;
          const weekday = new Date(d.year_ad, d.month_ad - 1, d.date_ad).getDay();
          const weeklyOff = isWeeklyOff(weekday, p.markedWeekDays);
          // When employee offs are known, suppress the conversion-layer
          // Saturday `is_holiday` flag — `data-weekend` already owns it.
          const holidayFlag = dynamicOffs ? false : d.is_holiday;
          return (
            <button
              key={`${d.year_ad}-${d.month_ad}-${d.date_ad}`}
              type="button"
              role="gridcell"
              className={`hpc-day ${p.styles.dayClass ?? ""} ${userSelected} ${userToday}`}
              data-today={d.is_today && !p.styles.todayClass}
              data-selected={selected && !p.styles.selectedDayClass}
              data-in-range={inRange}
              data-holiday={holidayFlag}
              data-weekend={weeklyOff}
              data-other-month={p.isOtherMonth(d)}
              data-marked={marker !== null}
              title={marker ?? undefined}
              aria-selected={selected}
              aria-disabled={disabled}
              disabled={disabled}
              onClick={() => {
                if (!disabled) p.onSelect(d);
              }}
            >
              <span className="hpc-day-primary">{p.getPrimary(d)}</span>
              <span className="hpc-day-secondary">{p.getSecondary(d)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
