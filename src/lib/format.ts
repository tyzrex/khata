import { AD_STYLE, dateView, type DateStyle } from "@/lib/nepali-date";

const wholeFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const paisaFormat = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Whole rupees stay bare ("2,970"); anything with paisa shows both digits ("2,970.50", never "2,970.5"). */
function amountText(value: number) {
  const cents = Math.round(Math.abs(value) * 100);
  return cents % 100 === 0 ? wholeFormat.format(cents / 100) : paisaFormat.format(cents / 100);
}

export function formatNpr(amount: number, style: "plain" | "in" | "out" = "plain") {
  const abs = amountText(amount);
  if (style === "out") return `−NPR ${abs}`;
  if (style === "in") return `+NPR ${abs}`;
  if (amount < 0) return `−NPR ${abs}`;
  return `NPR ${abs}`;
}

/** "Thursday 8 October" or, in BS, "Thursday 22 Ashwin". */
export function formatLongDate(iso: string, style: DateStyle = AD_STYLE) {
  const view = dateView(iso, style);
  return `${view.weekdayLong} ${view.num(view.day)} ${view.monthLong}`;
}

/** "Thursday 8 Oct" or, in BS, "बिहिवार २२ असोज". Weekdays stay whole; short forms like "बिहि" read as typos. */
export function formatEntryDate(iso: string, style: DateStyle = AD_STYLE) {
  const view = dateView(iso, style);
  return `${view.weekdayLong} ${view.num(view.day)} ${view.monthShort}`;
}

/** "8 Oct 2026" or, in BS, "22 Ashwin 2083". */
export function formatFullDate(iso: string, style: DateStyle = AD_STYLE) {
  const view = dateView(iso, style);
  return `${view.num(view.day)} ${view.monthShort} ${view.num(view.year)}`;
}

/** "October 2026" or, in BS, "Ashwin 2083". */
export function formatMonthYear(iso: string, style: DateStyle = AD_STYLE) {
  const view = dateView(iso, style);
  return `${view.monthLong} ${view.num(view.year)}`;
}

export function formatRange(start: string, end: string, style: DateStyle = AD_STYLE) {
  const from = dateView(start, style);
  const to = dateView(end, style);
  const sameMonth = from.month === to.month && from.year === to.year;
  const startText = `${from.num(from.day)}${sameMonth ? "" : ` ${from.monthShort}`}${from.year === to.year ? "" : ` ${from.num(from.year)}`}`;
  return `${startText} – ${to.num(to.day)} ${to.monthShort} ${to.num(to.year)}`;
}

/** Grouped number with no currency prefix, for hero figures with a separate unit label. */
export function formatAmount(amount: number) {
  return amountText(amount);
}
