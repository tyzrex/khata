// src/hooks/use-calendar-month.ts
import { useMemo, useState } from "react";
import { Calendar, type ConvertedDate } from "../core/date-conversion/conversions";
import { approxEnglishMonths } from "../core/date-conversion/data";
import { StringUtils } from "../core/utils/string-utils";
import type { DisabledDays, Locale } from "../types";

interface Args {
  selectedDate: Date;
  showAllDays: boolean;
  disabledDays: DisabledDays;
  locale: Locale;
  disableYearNavigation: boolean;
}

type Dir = "next" | "previous";

export function useCalendarMonth(args: Args) {
  const { selectedDate, showAllDays, disabledDays, locale } = args;
  const [calendar] = useState(() => new Calendar());
  const [strings] = useState(() => new StringUtils());

  const selectedDay = useMemo(
    () =>
      calendar.convert_date_using_ad(
        selectedDate.getFullYear(),
        selectedDate.getMonth() + 1,
        selectedDate.getDate(),
      ),
    [calendar, selectedDate],
  );

  const days = useMemo(
    () => calendar.getConvertedMonthDaysByTimestamp(selectedDate.getTime(), showAllDays),
    [calendar, selectedDate, showAllDays],
  );

  const monthLabel = useMemo(
    () =>
      `${selectedDay.month_bs_np} ${strings.convertEnglishDigitToNepali(
        selectedDay.year_bs,
        locale,
        false,
      )} - ${approxEnglishMonths[selectedDay.month_bs - 1]}`,
    [selectedDay, locale, strings],
  );

  const currentMonth = selectedDay.month_bs;
  const currentYear = selectedDay.year_bs;

  function switchMonth(direction: Dir): Date {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() + (direction === "next" ? 1 : -1));
    const todayBS = calendar.convert_date_using_ad(
      newDate.getFullYear(),
      newDate.getMonth() + 1,
      newDate.getDate(),
    );
    // `selectedDay` is the month being left. A clean step moves the BS month by one.
    const prev = selectedDay;
    if (prev.month_bs + 1 === todayBS.month_bs || prev.month_bs === todayBS.month_bs + 1) {
      return newDate;
    }
    // month-skip workaround (Svelte lines 140-156)
    newDate.setDate(newDate.getDate() + (direction === "next" ? -2 : 2));
    return newDate;
  }

  function switchYear(direction: Dir): Date {
    const newDate = new Date(selectedDate);
    newDate.setFullYear(newDate.getFullYear() + (direction === "next" ? 1 : -1));
    return newDate;
  }

  function bsOf(date: Date): ConvertedDate {
    return calendar.convert_date_using_ad(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  function isNavDisabled(direction: "prev" | "next", type: "month" | "year"): boolean {
    if (!disabledDays?.past && !disabledDays?.yearSwitch) return false;
    if (direction === "next") return false;
    const todayBS = bsOf(new Date());
    const todayYear = todayBS.year_bs;
    const todayMonth = todayBS.month_bs;
    if (type === "month") {
      const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      if (prevYear < todayYear) return true;
      if (prevYear === todayYear && prevMonth < todayMonth) return true;
      return false;
    }
    const prevYear = currentYear - 1;
    if (prevYear < todayYear) return true;
    if (prevYear === todayYear && currentMonth < todayMonth) return true;
    return false;
  }

  /** Jump straight to the 1st of a chosen BS year+month (for the header dropdowns). */
  function jumpTo(yearBs: number, monthBs: number): Date {
    const ad = calendar.convert_date_using_bs(yearBs, monthBs, 1);
    return new Date(ad.year_ad, ad.month_ad - 1, ad.date_ad);
  }

  return { days, selectedDay, monthLabel, switchMonth, switchYear, isNavDisabled, bsOf, jumpTo };
}
