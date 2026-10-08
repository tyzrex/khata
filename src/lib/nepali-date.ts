import { Calendar } from "@/components/np-calendar/core/date-conversion/conversions";
import {
  months_ad,
  months_bs,
  totalDaysInMonthsByYear,
  weekDays,
  weekDaysThreeAlpha,
} from "@/components/np-calendar/core/date-conversion/data";
import { monthBounds } from "@/lib/period";

/**
 * Everything stored in the database is an AD calendar date (`YYYY-MM-DD`) or a UTC
 * timestamp. Bikram Sambat only exists here, in memory, as a way to show and pick dates.
 */
export type CalendarKind = "AD" | "BS";
export type Script = "en" | "np";
export type DateStyle = { calendar: CalendarKind; script: Script };
export const AD_STYLE: DateStyle = { calendar: "AD", script: "en" };

export type DateParts = { year: number; month: number; day: number };

// The conversion tables are reliable inside this window; outside it we fall back to AD.
const MIN_AD_YEAR = 1950;
const MAX_AD_YEAR = 2040;

const converter = new Calendar();
const bsCache = new Map<string, DateParts | null>();

export function parseIso(iso: string): DateParts {
  const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

export function toIso({ year, month, day }: DateParts) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function adToBs(iso: string): DateParts | null {
  const cached = bsCache.get(iso);
  if (cached !== undefined) return cached;
  const { year, month, day } = parseIso(iso);
  let result: DateParts | null = null;
  if (year >= MIN_AD_YEAR && year <= MAX_AD_YEAR) {
    const converted = converter.convert_date_using_ad(year, month, day);
    if (converted.year_bs) result = { year: converted.year_bs, month: converted.month_bs, day: converted.date_bs };
  }
  bsCache.set(iso, result);
  return result;
}

export function bsToAd(year: number, month: number, day: number): string | null {
  if (year < MIN_AD_YEAR + 57 || year > MAX_AD_YEAR + 56) return null;
  const converted = converter.convert_date_using_bs(year, month, day);
  if (!converted.year_ad) return null;
  return toIso({ year: converted.year_ad, month: converted.month_ad, day: converted.date_ad });
}

export function bsMonthLength(year: number, month: number) {
  return totalDaysInMonthsByYear.find((row) => row[0] === year)?.[month] ?? 30;
}

const NEPALI_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];

export function localizeDigits(value: number | string, script: Script) {
  const text = String(value);
  return script === "np" ? text.replace(/\d/g, (digit) => NEPALI_DIGITS[Number(digit)] ?? digit) : text;
}

export type DateView = {
  calendar: CalendarKind;
  year: number;
  month: number;
  day: number;
  monthLong: string;
  monthShort: string;
  weekdayShort: string;
  weekdayLong: string;
  /** Digits in the chosen script. */
  num: (value: number) => string;
};

/** Everything needed to print one ISO date in the chosen calendar. */
export function dateView(iso: string, style: DateStyle = AD_STYLE): DateView {
  const ad = parseIso(iso);
  const bs = style.calendar === "BS" ? adToBs(iso) : null;
  const parts = bs ?? ad;
  const names = (bs ? months_bs : months_ad)[style.script] ?? [];
  const monthLong = names[parts.month - 1] ?? "";
  const weekday = new Date(Date.UTC(ad.year, ad.month - 1, ad.day)).getUTCDay();
  return {
    calendar: bs ? "BS" : "AD",
    ...parts,
    monthLong,
    monthShort: style.script === "en" && !bs ? monthLong.slice(0, 3) : monthLong,
    weekdayShort: weekDaysThreeAlpha[style.script][weekday] as string,
    weekdayLong: weekDays[style.script][weekday] as string,
    num: (value) => localizeDigits(value, style.script),
  };
}

function addAdMonths(iso: string, months: number) {
  const { year, month } = parseIso(iso);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 10);
}

/** First and last day of the month containing `iso`, in the chosen calendar. */
export function monthRange(iso: string, calendar: CalendarKind) {
  const bs = calendar === "BS" ? adToBs(iso) : null;
  if (!bs) return monthBounds(iso);
  const start = bsToAd(bs.year, bs.month, 1);
  const end = bsToAd(bs.year, bs.month, bsMonthLength(bs.year, bs.month));
  return start && end ? { start, end } : monthBounds(iso);
}

/** First and last day of the year containing `iso`, in the chosen calendar. */
export function yearRange(iso: string, calendar: CalendarKind) {
  const bs = calendar === "BS" ? adToBs(iso) : null;
  if (bs) {
    const start = bsToAd(bs.year, 1, 1);
    const end = bsToAd(bs.year, 12, bsMonthLength(bs.year, 12));
    if (start && end) return { start, end };
  }
  const year = iso.slice(0, 4);
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** The first day of the month `months` away from the one containing `iso`. */
export function shiftMonth(iso: string, months: number, calendar: CalendarKind) {
  const bs = calendar === "BS" ? adToBs(iso) : null;
  if (bs) {
    const index = bs.year * 12 + (bs.month - 1) + months;
    const next = bsToAd(Math.floor(index / 12), (index % 12) + 1, 1);
    if (next) return next;
  }
  return addAdMonths(iso, months);
}

/** The same spot in the year `years` away; clamps the day if it does not exist there. */
export function shiftYear(iso: string, years: number, calendar: CalendarKind) {
  const bs = calendar === "BS" ? adToBs(iso) : null;
  if (bs) {
    const year = bs.year + years;
    const next = bsToAd(year, bs.month, Math.min(bs.day, bsMonthLength(year, bs.month)));
    if (next) return next;
  }
  const { year, month, day } = parseIso(iso);
  const last = new Date(Date.UTC(year + years, month, 0)).getUTCDate();
  return toIso({ year: year + years, month, day: Math.min(day, last) });
}
