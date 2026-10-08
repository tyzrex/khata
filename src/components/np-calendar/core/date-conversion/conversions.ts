import { StringUtils } from "../utils/string-utils";
/** Panchanga data is not bundled with this copy of the calendar; the field is always null. */
export type PanchangaData = Record<string, unknown>;
import {
  ENDING_YEAR_BS,
  STARTING_DATE_AD,
  STARTING_DATE_BS,
  STARTING_DAY_AD,
  STARTING_DAY_BS,
  STARTING_MONTH_AD,
  STARTING_MONTH_BS,
  STARTING_YEAR_AD,
  STARTING_YEAR_BS,
} from "./config";
import {
  daysInLeapMonth,
  daysInNormalMonth,
  DEFAULT_HOLIDAY_LIST,
  months_ad,
  months_bs,
  totalDaysInMonthsByYear,
  weekDays,
} from "./data";
import { date_to_dd_mm_yy, NepalDate } from "./date";

export interface ConvertedDate {
  year_ad: number;
  is_today: boolean;
  is_holiday: boolean;
  panchanga: PanchangaData | null;
  year_bs: number;
  month_ad: number;
  month_bs: number;
  month_ad_en: string;
  month_bs_en: string;
  month_ad_np: string;
  month_bs_np: string;
  date_ad: number;
  date_bs: number;
  date_bs_np: string;
  day_en: string;
  day_np: string;
  day: number;
}

export class Calendar {
  private eng_number = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  private converted_date_bs: ConvertedDate = {
    year_ad: 0,
    year_bs: 0,
    month_ad: 0,
    month_bs: 0,
    is_today: false,
    is_holiday: false,
    panchanga: null,
    month_ad_en: "",
    month_bs_en: "",
    month_ad_np: "",
    month_bs_np: "",
    date_bs_np: "",
    date_ad: 0,
    date_bs: 0,
    day_en: "",
    day_np: "",
    day: 0,
  };
  private converted_date_ad: ConvertedDate = {
    year_ad: 0,
    year_bs: 0,
    month_ad: 0,
    month_bs: 0,
    is_today: false,
    is_holiday: false,
    panchanga: null,
    month_ad_en: "",
    month_bs_en: "",
    month_ad_np: "",
    month_bs_np: "",
    date_bs_np: "",
    date_ad: 0,
    date_bs: 0,
    day_en: "",
    day_np: "",
    day: 0,
  };
  private debug_info: string = ""; // Add a specific type if possible
  private static singleDayCache: Map<string, ConvertedDate> = new Map();

  /**
   * Whether an AD y/m/d is today **in Nepal**, asked fresh every time.
   *
   * `NepalDate()` re-zones `new Date()` to Asia/Kathmandu, so this never depends on the viewer's
   * own timezone — a browser in another region still agrees with the business calendar.
   */
  private static isTodayAd(yy: number, mm: number, dd: number): boolean {
    const today = NepalDate();
    return today.getFullYear() === yy && today.getMonth() === mm - 1 && today.getDate() === dd;
  }

  /**
   * Returns a cached conversion with `is_today` recomputed.
   *
   * `singleDayCache` is a **static** map: it lives for the whole tab, shared by every `Calendar`
   * instance in the app. Caching the y/m/d ↔ BS arithmetic is right — it is immutable table
   * lookup. Caching `is_today` alongside it was not: the first conversion of a date froze its
   * "today" flag forever, so a tab left open across midnight kept highlighting yesterday and never
   * highlighted the new day. That is the "dates looked right, then after a while they were one day
   * off" report — a stale cache, not a timezone offset.
   *
   * A copy is returned rather than a mutated cache entry, so callers can never write back into the
   * shared map.
   */
  private static withFreshToday(cached: ConvertedDate): ConvertedDate {
    return {
      ...cached,
      is_today: Calendar.isTodayAd(cached.year_ad, cached.month_ad, cached.date_ad),
    };
  }
  private static multipleDaysCache: Map<string, ConvertedDate[]> = new Map();

  private is_leap_year(year: number): boolean {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }

  private get_day_of_week(day: number): string {
    const dayIndex = day - 1;
    return weekDays?.en?.[dayIndex] || "";
  }

  private get_nep_day_of_week(day: number): string {
    const dayIndex = day - 1;
    return weekDays?.np?.[dayIndex] || "";
  }
  public getNepaliDigits(digit: number) {
    let nepDate = "";
    for (let i = 0; i < digit.toString().length; i++) {
      nepDate = nepDate + String.fromCharCode(digit.toString().charAt(i).charCodeAt(0) + 2358);
    }
    return nepDate;
  }
  private get_eng_day_of_week(day: number): string {
    const dayIndex = day - 1;
    return weekDays?.en?.[dayIndex] || "";
  }

  private get_bs_month_in_nepali(month: number): string {
    const monthIndex = month - 1;
    return months_bs?.np?.[monthIndex] || "";
  }
  private get_bs_month_in_english(month: number): string {
    const monthIndex = month - 1;
    return months_bs?.en?.[monthIndex] || "";
  }
  private get_ad_month_in_english(month: number): string {
    const monthIndex = month - 1;
    return months_ad?.en?.[monthIndex] || "";
  }
  private get_ad_month_in_nepali(month: number): string {
    const monthIndex = month - 1;
    return months_ad?.np?.[monthIndex] || "";
  }

  public is_range_eng(yy: number, mm: number, dd: number): boolean {
    if (yy < 1944 || yy > 2033) {
      this.debug_info = "Supported only between 1944-2022";
      return false;
    }

    if (mm < 1 || mm > 12) {
      this.debug_info = "Error! value 1-12 only";
      return false;
    }

    if (dd < 1 || dd > 31) {
      this.debug_info = "Error! value 1-31 only";
      return false;
    }

    return true;
  }

  public is_range_npp(yy: number, mm: number, dd: number): boolean {
    if (yy < 2000 || yy > 2089) {
      this.debug_info = "Supported only between 2000-2089";
      return false;
    }

    if (mm < 1 || mm > 12) {
      this.debug_info = "Error! value 1-12 only";
      return false;
    }

    if (dd < 1 || dd > 32) {
      this.debug_info = "Error! value 1-31 only";
      return false;
    }

    return true;
  }
  public is_range_nep(yy: number, mm: number, dd: number): boolean {
    if (yy < STARTING_YEAR_BS || yy > ENDING_YEAR_BS) {
      this.debug_info = "Supported only between 2000-2089";
      return false;
    }

    if (mm < 1 || mm > 12) {
      this.debug_info = "Error! value 1-12 only";
      return false;
    }

    if (dd < 1 || dd > 32) {
      this.debug_info = "Error! value 1-31 only";
      return false;
    }

    return true;
  }

  public convert_date_using_ad(yy: number, mm: number, dd: number): ConvertedDate {
    let cacheKey = `${yy}-${mm}-${dd}`;
    if (!yy || !mm || !dd) {
      cacheKey = date_to_dd_mm_yy(NepalDate());
    }
    if (Calendar.singleDayCache.has(cacheKey)) {
      return Calendar.withFreshToday(Calendar.singleDayCache.get(cacheKey)!);
    }

    const def_eyy = STARTING_YEAR_AD + 1;
    const def_nyy = STARTING_YEAR_BS;

    const def_nmm = STARTING_MONTH_BS;
    const def_ndd = STARTING_DATE_BS;

    // Count total days from reference date to input date
    let total_eDays = 0;
    let total_nDays: number;
    let day = STARTING_DAY_BS;

    let m: number;
    let y: number;
    let i: number;
    let j: number = 0;
    const stringUtils = new StringUtils();

    for (i = 0; i < yy - def_eyy; i++) {
      if (this.is_leap_year(def_eyy + i)) {
        for (j = 0; j < 12; j++) {
          if (daysInLeapMonth[j]) {
            total_eDays += daysInLeapMonth[j]!;
          }
        }
      } else {
        for (j = 0; j < 12; j++) total_eDays += daysInNormalMonth[j]!;
      }
    }

    for (i = 0; i < mm - 1; i++) {
      if (this.is_leap_year(yy)) total_eDays += daysInLeapMonth[i]!;
      else total_eDays += daysInNormalMonth[i]!;
    }

    total_eDays += dd;

    i = 0;
    j = def_nmm;
    total_nDays = def_ndd;
    m = def_nmm;
    y = def_nyy;

    while (total_eDays !== 0) {
      const a = totalDaysInMonthsByYear?.[i]?.[j];
      total_nDays++; // count the days
      day++;
      if (a && total_nDays > a) {
        m++;
        total_nDays = 1;
        j++;
      }

      if (day > 7) {
        day = 1;
      }

      if (m > 12) {
        y++;
        m = 1;
      }

      if (j > 12) {
        j = 1;
        i++;
      }

      total_eDays--;
    }

    const isToday = Calendar.isTodayAd(yy, mm, dd);

    const result: ConvertedDate = Object.assign({
      year_ad: yy,
      year_bs: y,
      month_ad: mm,
      month_bs: m,
      is_today: isToday,
      month_ad_en: this.get_ad_month_in_english(mm),
      month_bs_en: this.get_bs_month_in_english(m),
      month_ad_np: this.get_ad_month_in_nepali(mm),
      month_bs_np: this.get_bs_month_in_nepali(m),
      date_ad: dd,
      date_bs: total_nDays,
      date_bs_np: this.getNepaliDigits(total_nDays),
      day_en: this.get_day_of_week(day),
      day_np: this.get_nep_day_of_week(day),
      day: day,
      is_holiday: DEFAULT_HOLIDAY_LIST.includes(day - 1),
      panchanga: null,
    });
    Calendar.singleDayCache.set(cacheKey, result);
    return Calendar.withFreshToday(result);
  }
  public getDaysInMonth(yy: number, mm: number): number {
    const yearData = totalDaysInMonthsByYear.find((data) => data[0] === yy);
    if (yearData) {
      const daysInMonth = yearData[mm === 0 ? 1 : mm];

      if (daysInMonth !== undefined) {
        return daysInMonth;
      }
    }
    return 0;
  }
  getWeekday(year: number, month: number, day: number): number {
    const date = new Date(year, month - 1, day); // Month is zero-based, so subtract 1
    const weekday = date.getDay();

    if (weekday !== undefined) {
      return weekday;
    }

    return 0;
  }
  isToday(today: Date, day: number) {
    const currentDate = new Date();
    const currentDay = currentDate.getDate();
    return day === currentDay && today.getDate() === currentDay;
  }
  public add_bs_days(date: ConvertedDate, daysToAdd: number) {
    if (date.date_ad === 1) {
      date.month_ad = date.month_ad - 1;
    } else {
      date.date_ad = date.date_ad - 1;
    }
    if (date.month_ad === 1) {
      date.month_ad = 12;
      date.year_ad = date.year_ad - 1;
    }
    console.log(date);
    return this.convert_date_using_ad(date.year_ad, date.month_ad, date.date_ad);
  }
  public convert_date_using_bs(yy: number, mm: number, dd: number): ConvertedDate {
    const cacheKey = `bs:${yy}-${mm}-${dd}`;
    // Check if the result is already in cache
    if (Calendar.singleDayCache.has(cacheKey)) {
      return Calendar.withFreshToday(Calendar.singleDayCache.get(cacheKey)!);
    }

    const def_eyy: number = STARTING_YEAR_AD;

    const def_emm: number = STARTING_MONTH_AD;
    const def_edd: number = STARTING_DATE_AD;

    const def_nyy: number = STARTING_YEAR_BS;
    let total_eDays: number = 0;
    let total_nDays: number = 0;
    let a: number = 0;
    let day: number = STARTING_DAY_AD;

    let m: number = 0;
    let y: number = 0;
    let i: number = 0;
    let k: number = 0;
    const stringUtils = new StringUtils();

    const month: number[] = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const lmonth: number[] = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    if (!this.is_range_nep(yy, mm, dd)) {
      return this.converted_date_ad;
    } else {
      // count total days in-terms of year
      for (i = 0; i < yy - def_nyy; i++) {
        for (let j = 1; j <= 12; j++) {
          total_nDays += totalDaysInMonthsByYear[k]?.[j] ?? 0;
        }
        k++;
      }

      // count total days in-terms of month
      for (let j = 1; j < mm; j++) {
        total_nDays += totalDaysInMonthsByYear[k]?.[j] ?? 0;
      }

      // count total days in-terms of date
      total_nDays += dd;

      // calculation of equivalent english date...
      total_eDays = def_edd;
      m = def_emm;
      y = def_eyy;

      while (total_nDays !== 0) {
        if (this.is_leap_year(y) && a) {
          a = lmonth[m] || 0;
        } else {
          a = month[m] || 0;
        }
        total_eDays++;
        day++;

        if (total_eDays > a) {
          m++;
          total_eDays = 1;

          if (m > 12) {
            y++;
            m = 1;
          }
        }

        if (day > 7) {
          day = 1;
        }

        total_nDays--;
      }
      const isToday = Calendar.isTodayAd(y, m, total_eDays);
      const result: ConvertedDate = Object.assign({
        year_ad: y,
        year_bs: yy,
        month_ad: m,
        month_bs: mm,
        month_ad_en: this.get_ad_month_in_english(m),
        month_ad_np: this.get_ad_month_in_nepali(m),
        month_bs_en: this.get_bs_month_in_english(mm),
        month_bs_np: this.get_bs_month_in_nepali(mm),
        date_ad: total_eDays,
        date_bs: dd,
        date_bs_np: stringUtils.convertEnglishDigitToNepali(dd, "np", true),
        day_en: this.get_eng_day_of_week(day),
        day_np: this.get_nep_day_of_week(day),
        day: day,
        is_holiday: DEFAULT_HOLIDAY_LIST.includes(day - 1),
        is_today: isToday,
        panchanga: null,
      });
      Calendar.singleDayCache.set(cacheKey, result);
      return Calendar.withFreshToday(result);
    }
  }

  public getDateObject(
    date: Date,
    bsDate: number,
    bsMonth: number,
    yearBs: number,
    isToday: boolean = false,
  ) {
    const stringUtils = new StringUtils();

    return {
      year_ad: date.getFullYear(),
      year_bs: yearBs,
      month_ad: date.getMonth() + 1,
      month_bs: bsMonth,
      is_today: isToday,
      is_holiday: DEFAULT_HOLIDAY_LIST.includes(date.getDay()),
      panchanga: null,
      month_ad_en: this.get_ad_month_in_english(date.getMonth() + 1),
      month_bs_en: this.get_bs_month_in_english(bsMonth),
      month_ad_np: this.get_ad_month_in_nepali(date.getMonth() + 1),
      month_bs_np: this.get_bs_month_in_nepali(bsMonth),
      date_ad: date.getDate(),
      date_bs: bsDate,
      date_bs_np: stringUtils.convertEnglishDigitToNepali(bsDate, "np", false),
      day_en: this.get_eng_day_of_week(date.getDay() + 1),
      day_np: this.get_nep_day_of_week(date.getDay() + 1),
      day: date.getDay(),
    };
  }

  public getConvertedMonthDaysByTimestamp(timestamp: number, showAllDays: boolean = false) {
    const days: ConvertedDate[] = [];
    const selectedDate = new Date(timestamp);
    const stringUtils = new StringUtils();
    const convertedDate = this.convert_date_using_ad(
      selectedDate.getFullYear(),
      selectedDate.getMonth() + 1,
      selectedDate.getDate(),
    );
    const monthStartAD = this.convert_date_using_bs(
      convertedDate.year_bs,
      convertedDate.month_bs,
      1,
    );
    const totalDaysInCurrentBsMonth = this.getDaysInMonth(
      convertedDate.year_bs,
      convertedDate.month_bs,
    );
    const totalDaysInPreviousBsMonth = this.getDaysInMonth(
      convertedDate.month_bs === 1 ? convertedDate.year_bs - 1 : convertedDate.year_bs,
      convertedDate.month_bs === 1 ? 12 : convertedDate.month_bs - 1,
    );

    const isLeapYear = this.is_leap_year(monthStartAD.year_ad);
    let totalDaysCurrentAdMonth = isLeapYear
      ? daysInLeapMonth[monthStartAD.month_ad - 1]
      : daysInNormalMonth[monthStartAD.month_ad - 1];

    const startingWeekDay = monthStartAD.day - 1; // Assuming 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    let currentAdDate = monthStartAD.date_ad;
    let currentAdMonth = monthStartAD.month_ad;
    let currentAdYear = monthStartAD.year_ad;
    const prevSlotsAvailable = startingWeekDay;
    let nextMonthBSStarting = 1;
    // Always 6 weeks (42 cells) so navigating months doesn't jump the popover
    // height. (`showAllDays` used to toggle 35 vs 42; we keep the param for
    // API compat but both paths now use a full grid.)
    const slotsNeeded = 42;

    const createDay = (
      date: Date,
      bsDate: number,
      bsMonth: number,
      yearAd: number,
      yearBs: number,
      isToday: boolean = false,
      nextMonth: boolean = false,
    ): ConvertedDate => {
      return {
        year_ad: date.getFullYear(),
        year_bs: yearBs,
        month_ad: date.getMonth() + 1,
        month_bs: bsMonth,
        is_today: isToday,
        is_holiday: DEFAULT_HOLIDAY_LIST.includes(date.getDay()),
        panchanga: null,
        month_ad_en: this.get_ad_month_in_english(date.getMonth() + 1),
        month_bs_en: this.get_bs_month_in_english(bsMonth),
        month_ad_np: this.get_ad_month_in_nepali(date.getMonth() + 1),
        month_bs_np: this.get_bs_month_in_nepali(bsMonth),
        date_ad: date.getDate(),
        date_bs: bsDate,
        date_bs_np: stringUtils.convertEnglishDigitToNepali(bsDate, "np", false),
        day_en: this.get_eng_day_of_week(date.getDay() + 1),
        day_np: this.get_nep_day_of_week(date.getDay() + 1),
        day: date.getDay(),
      };
    };

    // Fill previous month's dates
    for (let i = prevSlotsAvailable; i > 0; i--) {
      const prevAdDate = new Date(currentAdYear, currentAdMonth - 1, currentAdDate - i);
      days.push(
        createDay(
          prevAdDate,
          totalDaysInPreviousBsMonth - (i - 1),
          convertedDate.month_bs - 1,
          currentAdYear,
          convertedDate.year_bs,
        ),
      );
    }

    // Fill current month's dates
    for (let i = 1; i <= totalDaysInCurrentBsMonth; i++) {
      // Was three separate `new Date()` reads in the viewer's own zone, which could disagree with
      // the Nepal-based `is_today` the conversion core reports for the very same day.
      const isToday = Calendar.isTodayAd(currentAdYear, currentAdMonth, currentAdDate);
      days.push(
        createDay(
          new Date(currentAdYear, currentAdMonth - 1, currentAdDate),
          i,
          convertedDate.month_bs,
          currentAdYear,
          convertedDate.year_bs,
          isToday,
        ),
      );
      // Increment AD date
      currentAdDate++;
      if (currentAdDate > totalDaysCurrentAdMonth) {
        currentAdDate = 1;
        currentAdMonth++;
        if (currentAdMonth > 12) {
          currentAdMonth = 1;
          currentAdYear++;
        }
        totalDaysCurrentAdMonth = this.is_leap_year(currentAdYear)
          ? daysInLeapMonth[currentAdMonth - 1]
          : daysInNormalMonth[currentAdMonth - 1];
      }
    }
    const lastDayOfCurrentBsMonth = days[totalDaysInCurrentBsMonth];
    // Fill next month's dates
    for (let i = 1; days.length < slotsNeeded; i++) {
      const nextAdDate = new Date(currentAdYear, currentAdMonth - 1, currentAdDate + i - 1);
      const day = createDay(
        nextAdDate,
        nextMonthBSStarting++,
        lastDayOfCurrentBsMonth?.month_bs === 12 ? 1 : convertedDate?.month_bs + 1,
        currentAdYear,
        lastDayOfCurrentBsMonth?.month_bs === 12
          ? convertedDate.year_bs + 1
          : convertedDate.year_bs,
        false,
        true,
      );
      days.push(day);
    }

    return days;
  }
  public convert_date_using_date(date: Date): ConvertedDate {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return this.convert_date_using_ad(year, month, day);
  }
}
export function addDaysToDate(inputDate: Date, daysToAdd: number): Date {
  const date = new Date(inputDate);
  date.setDate(date.getDate() + daysToAdd);
  return date;
}
