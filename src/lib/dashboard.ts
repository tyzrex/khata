import { AD_STYLE, dateView, monthRange, shiftMonth, shiftYear, yearRange, type CalendarKind, type DateStyle } from "@/lib/nepali-date";
import { roundMoney, weekBounds } from "@/lib/period";
import type { TxType } from "@/lib/constants";

export type RangeKind = "week" | "month" | "year" | "all" | "custom";
export type DateRange = { start: string; end: string };

export type Money = { date: string; type: TxType; amount: number; category: string; merchant: string; account: string };

function parse(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

function format(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number) {
  const date = parse(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return format(date);
}

export function daysBetween(start: string, end: string) {
  return Math.round((parse(end).getTime() - parse(start).getTime()) / 86_400_000) + 1;
}

/** The inclusive range a period kind covers around `anchor`. `all` and `custom` need extra input. */
export function rangeFor(kind: RangeKind, anchor: string, extra: { custom?: DateRange; all?: DateRange } = {}, calendar: CalendarKind = "AD"): DateRange {
  switch (kind) {
    case "week":
      return weekBounds(anchor);
    case "month":
      return monthRange(anchor, calendar);
    case "year":
      return yearRange(anchor, calendar);
    case "all":
      return extra.all ?? { start: anchor, end: anchor };
    case "custom": {
      const custom = extra.custom ?? { start: anchor, end: anchor };
      return custom.start <= custom.end ? custom : { start: custom.end, end: custom.start };
    }
  }
}

/** Move the anchor one period back or forward. */
export function shiftAnchor(kind: RangeKind, anchor: string, direction: -1 | 1, calendar: CalendarKind = "AD") {
  if (kind === "week") return addDays(anchor, 7 * direction);
  if (kind === "month") return shiftMonth(anchor, direction, calendar);
  if (kind === "year") return shiftYear(anchor, direction, calendar);
  return anchor;
}

/** The range immediately before `range`, used for "vs last period". */
export function previousRange(kind: RangeKind, range: DateRange, calendar: CalendarKind = "AD"): DateRange {
  if (kind === "month") return monthRange(shiftMonth(range.start, -1, calendar), calendar);
  if (kind === "year") return yearRange(shiftYear(range.start, -1, calendar), calendar);
  const length = daysBetween(range.start, range.end);
  return { start: addDays(range.start, -length), end: addDays(range.start, -1) };
}

/** A human label for a range: "5 – 11 Oct 2026", "October 2026", "2026"; BS reads "Ashwin 2083". */
export function describeRange(kind: RangeKind, range: DateRange, style: DateStyle = AD_STYLE) {
  const from = dateView(range.start, style);
  const to = dateView(range.end, style);
  if (kind === "month") return `${from.monthLong} ${from.num(from.year)}`;
  if (kind === "year") return from.num(from.year);
  if (kind === "all") return "All time";
  if (range.start === range.end) return `${from.num(from.day)} ${from.monthShort} ${from.num(from.year)}`;
  if (from.year === to.year && from.month === to.month) return `${from.num(from.day)} – ${to.num(to.day)} ${to.monthShort} ${to.num(to.year)}`;
  if (from.year === to.year) return `${from.num(from.day)} ${from.monthShort} – ${to.num(to.day)} ${to.monthShort} ${to.num(to.year)}`;
  return `${from.num(from.day)} ${from.monthShort} ${from.num(from.year)} – ${to.num(to.day)} ${to.monthShort} ${to.num(to.year)}`;
}

export type Bucket = { key: string; label: string; full: string; spent: number; credits: number };

export type DashboardStats = {
  range: DateRange;
  days: number;
  spent: number;
  income: number;
  transfers: number;
  credits: number;
  net: number;
  /** Share of credits kept, 0 to 1. Null when nothing came in. */
  savingsRate: number | null;
  expenseCount: number;
  creditCount: number;
  /** Spend per elapsed day. Days after `today` are not counted. */
  avgDaily: number;
  /** Month-end style forecast. Only set while the range still has days to go. */
  projected: number | null;
  biggest: Money | null;
  byCategory: { category: string; amount: number; count: number; share: number }[];
  topMerchants: { merchant: string; amount: number; count: number }[];
  granularity: "day" | "month";
  series: Bucket[];
};

function inRange(rows: Money[], range: DateRange) {
  return rows.filter((row) => row.date >= range.start && row.date <= range.end);
}

function total(rows: Money[]) {
  return roundMoney(rows.reduce((sum, row) => sum + row.amount, 0));
}

function dayLabel(iso: string, span: number, style: DateStyle) {
  const view = dateView(iso, style);
  return span <= 7 ? view.weekdayShort : view.num(view.day);
}

function fullDay(iso: string, style: DateStyle) {
  const view = dateView(iso, style);
  return `${view.weekdayLong}, ${view.num(view.day)} ${view.monthShort} ${view.num(view.year)}`;
}

function buildSeries(expenses: Money[], credits: Money[], range: DateRange, style: DateStyle) {
  const span = daysBetween(range.start, range.end);
  if (span <= 62) {
    const spent = new Map<string, number>();
    const came = new Map<string, number>();
    for (const row of expenses) spent.set(row.date, (spent.get(row.date) ?? 0) + row.amount);
    for (const row of credits) came.set(row.date, (came.get(row.date) ?? 0) + row.amount);
    const series: Bucket[] = [];
    for (let index = 0; index < span; index += 1) {
      const date = addDays(range.start, index);
      series.push({
        key: date,
        label: dayLabel(date, span, style),
        full: fullDay(date, style),
        spent: roundMoney(spent.get(date) ?? 0),
        credits: roundMoney(came.get(date) ?? 0),
      });
    }
    return { granularity: "day" as const, series };
  }
  // Longer ranges bucket by month of the chosen calendar, keyed by each month's first day.
  const keyOf = (date: string) => monthRange(date, style.calendar).start;
  const spent = new Map<string, number>();
  const came = new Map<string, number>();
  for (const row of expenses) spent.set(keyOf(row.date), (spent.get(keyOf(row.date)) ?? 0) + row.amount);
  for (const row of credits) came.set(keyOf(row.date), (came.get(keyOf(row.date)) ?? 0) + row.amount);
  const series: Bucket[] = [];
  let cursor = keyOf(range.start);
  while (cursor <= range.end) {
    const view = dateView(cursor, style);
    series.push({
      key: cursor,
      label: view.monthShort,
      full: `${view.monthLong} ${view.num(view.year)}`,
      spent: roundMoney(spent.get(cursor) ?? 0),
      credits: roundMoney(came.get(cursor) ?? 0),
    });
    cursor = shiftMonth(cursor, 1, style.calendar);
  }
  return { granularity: "month" as const, series };
}

export function computeStats(rows: Money[], range: DateRange, today: string, style: DateStyle = AD_STYLE): DashboardStats {
  const scoped = inRange(rows, range);
  const expenses = scoped.filter((row) => row.type === "expense");
  const incomeRows = scoped.filter((row) => row.type === "income");
  const transferRows = scoped.filter((row) => row.type === "transfer");
  const creditRows = [...incomeRows, ...transferRows];

  const spent = total(expenses);
  const income = total(incomeRows);
  const transfers = total(transferRows);
  const credits = roundMoney(income + transfers);
  const days = daysBetween(range.start, range.end);

  const categories = new Map<string, { amount: number; count: number }>();
  const merchants = new Map<string, { amount: number; count: number }>();
  for (const row of expenses) {
    const category = categories.get(row.category) ?? { amount: 0, count: 0 };
    category.amount = roundMoney(category.amount + row.amount);
    category.count += 1;
    categories.set(row.category, category);
    const merchant = merchants.get(row.merchant) ?? { amount: 0, count: 0 };
    merchant.amount = roundMoney(merchant.amount + row.amount);
    merchant.count += 1;
    merchants.set(row.merchant, merchant);
  }

  const elapsedEnd = today < range.end ? today : range.end;
  const elapsed = elapsedEnd < range.start ? 0 : daysBetween(range.start, elapsedEnd);
  const avgDaily = elapsed > 0 ? roundMoney(spent / elapsed) : 0;
  const remaining = days - elapsed;

  const { granularity, series } = buildSeries(expenses, creditRows, range, style);

  return {
    range,
    days,
    spent,
    income,
    transfers,
    credits,
    net: roundMoney(credits - spent),
    savingsRate: credits > 0 ? (credits - spent) / credits : null,
    expenseCount: expenses.length,
    creditCount: creditRows.length,
    avgDaily,
    projected: remaining > 0 && elapsed > 0 ? roundMoney(spent + avgDaily * remaining) : null,
    biggest: expenses.reduce<Money | null>((best, row) => (!best || row.amount > best.amount ? row : best), null),
    byCategory: [...categories.entries()]
      .map(([category, value]) => ({ category, ...value, share: spent > 0 ? value.amount / spent : 0 }))
      .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category)),
    topMerchants: [...merchants.entries()]
      .map(([merchant, value]) => ({ merchant, ...value }))
      .sort((a, b) => b.amount - a.amount || a.merchant.localeCompare(b.merchant))
      .slice(0, 5),
    granularity,
    series,
  };
}

/** Percent change from `previous` to `current`, as a fraction. Null when there is nothing to compare. */
export function change(current: number, previous: number) {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

export type AccountBalance = { account: string; balance: number; credits: number; spent: number };

/**
 * What sits in each account, across all time: credits in minus spend out.
 * `known` seeds the list so an account the person set up but has not used yet
 * still shows, holding zero, instead of silently vanishing from the card.
 */
export function accountBalances(rows: Money[], known: { name: string; sortOrder: number }[] = []): AccountBalance[] {
  const accounts = new Map<string, AccountBalance>();
  const order = new Map(known.map((account) => [account.name, account.sortOrder]));
  for (const name of order.keys()) {
    accounts.set(name, { account: name, balance: 0, credits: 0, spent: 0 });
  }
  for (const row of rows) {
    const entry = accounts.get(row.account) ?? { account: row.account, balance: 0, credits: 0, spent: 0 };
    if (row.type === "expense") entry.spent = roundMoney(entry.spent + row.amount);
    else entry.credits = roundMoney(entry.credits + row.amount);
    entry.balance = roundMoney(entry.credits - entry.spent);
    accounts.set(row.account, entry);
  }
  return [...accounts.values()].sort(
    (a, b) => b.balance - a.balance || (order.get(a.account) ?? 999) - (order.get(b.account) ?? 999) || a.account.localeCompare(b.account),
  );
}

export function dataBounds(rows: Money[], today: string): DateRange {
  if (rows.length === 0) return { start: today, end: today };
  let start = rows[0]!.date;
  let end = rows[0]!.date;
  for (const row of rows) {
    if (row.date < start) start = row.date;
    if (row.date > end) end = row.date;
  }
  return { start, end: end > today ? end : today };
}

/**
 * Running balance across every account (credits minus expenses, all time) at the close of each bucket.
 * Buckets after today are left out, and the bucket holding today closes at today.
 */
export function balanceTrail(rows: Money[], buckets: Bucket[], rangeEnd: string, today: string): { key: string; balance: number }[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const trail: { key: string; balance: number }[] = [];
  let cursor = 0;
  let running = 0;
  for (let index = 0; index < buckets.length; index += 1) {
    const bucket = buckets[index]!;
    if (bucket.key > today) break;
    const next = buckets[index + 1];
    const end = next ? addDays(next.key, -1) : rangeEnd;
    const close = end < today ? end : today;
    while (cursor < sorted.length && sorted[cursor]!.date <= close) {
      const row = sorted[cursor]!;
      running += row.type === "expense" ? -row.amount : row.amount;
      cursor += 1;
    }
    trail.push({ key: bucket.key, balance: roundMoney(running) });
  }
  return trail;
}
