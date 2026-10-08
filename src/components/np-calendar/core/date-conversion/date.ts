import { toZonedTime } from "date-fns-tz";

const NEPAL_TIME_ZONE = "Asia/Kathmandu";

export function NepalDate(date: Date = new Date()) {
  const date_ = toZonedTime(date, NEPAL_TIME_ZONE);
  return date_;
}

export function DateByTimeZone(date: Date = new Date(), timezone: string) {
  return toZonedTime(date, timezone || NEPAL_TIME_ZONE);
}
export function isDayToday(date: Date) {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}
export function areDatesSame(date1: Date, date2: Date): boolean {
  return (
    date1.getDate() === date2.getDate() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getFullYear() === date2.getFullYear()
  );
}

export const date_to_dd_mm_yy = (date: Date) => {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};
export const date_to_obj = (date: Date) => {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    date: date.getDate(),
  };
};
export const addPadStart = (num: number) => {
  return num.toString().padStart(2, "0");
};
export const yy_mm_dd_to_date = (yy: number, mm: number, dd: number) => {
  const year = addPadStart(yy);
  const month = addPadStart(mm);
  const day = addPadStart(dd);
  return new Date(`${year}-${month}-${day}`);
};
function convertTimeToSeconds(hours: number, minutes: number, seconds: number) {
  return hours * 3600 + minutes * 60 + seconds;
}

function getCurrentTimeInSeconds(date: Date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  return convertTimeToSeconds(hours, minutes, seconds);
}
function isToday(date: Date) {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}
export function calculateElapsedDayPercentage(
  date: Date,
  sunriseSeconds: number,
  sunsetSeconds: number,
): number {
  if (!isToday(date)) {
    return 0;
  }
  // Convert sunrise, sunset, and current time to seconds
  const sunriseTimeInSeconds = sunriseSeconds;
  const sunsetTimeInSeconds = sunsetSeconds;
  const currentTimeInSeconds = getCurrentTimeInSeconds(new Date());
  // Calculate total length of the day in seconds
  const totalDayLengthInSeconds = sunsetTimeInSeconds - sunriseTimeInSeconds;

  // Calculate elapsed time from sunrise to current time in seconds
  const elapsedDayInSeconds = currentTimeInSeconds - sunriseTimeInSeconds;

  // Calculate the percentage of elapsed day
  const elapsedDayPercentage = (elapsedDayInSeconds / totalDayLengthInSeconds) * 100;

  // Round to two decimal places
  return Math.abs(Number(elapsedDayPercentage.toFixed(2)));
}
export function getHourIndex(timestamp: number) {
  const date = new Date(timestamp);
  const hour = date.getHours();
  return hour === 0 ? 0 : hour;
}
