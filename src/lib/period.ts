import type { TxType } from "@/lib/constants";
import { KATHMANDU } from "@/lib/constants";
import type { DaySpend, PeriodSummary } from "@/lib/types";

export type LedgerAmount = {
  date: string;
  type: TxType;
  amount: number;
  category: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function todayInKathmandu(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KATHMANDU,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parseISODate(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

function formatISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function weekBounds(today: string) {
  const date = parseISODate(today);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  const start = new Date(date);
  start.setUTCDate(date.getUTCDate() - mondayOffset);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: formatISODate(start), end: formatISODate(end) };
}

export function monthBounds(today: string) {
  const [yearText, monthText] = today.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const start = `${yearText}-${monthText}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${yearText}-${monthText}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

export function eachDate(start: string, end: string) {
  const dates: string[] = [];
  const cursor = parseISODate(start);
  const last = parseISODate(end);
  while (cursor.getTime() <= last.getTime()) {
    dates.push(formatISODate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function sum(rows: LedgerAmount[]) {
  return roundMoney(rows.reduce((total, row) => total + row.amount, 0));
}

function rollup(rows: LedgerAmount[], bounds: { start: string; end: string }, withDaily: boolean): Omit<PeriodSummary, "byCategory"> & {
  byCategory: { category: string; amount: number; count: number }[];
} {
  const inRange = rows.filter((row) => row.date >= bounds.start && row.date <= bounds.end);
  const expenses = inRange.filter((row) => row.type === "expense");
  const income = inRange.filter((row) => row.type === "income");
  const transfers = inRange.filter((row) => row.type === "transfer");
  const spent = sum(expenses);
  const incomeTotal = sum(income);
  const transferTotal = sum(transfers);
  const grouped = new Map<string, { amount: number; count: number }>();

  for (const row of expenses) {
    const current = grouped.get(row.category) ?? { amount: 0, count: 0 };
    current.amount = roundMoney(current.amount + row.amount);
    current.count += 1;
    grouped.set(row.category, current);
  }

  const byCategory = [...grouped.entries()]
    .map(([category, value]) => ({ category, amount: value.amount, count: value.count }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));

  const daily: DaySpend[] = withDaily
    ? eachDate(bounds.start, bounds.end).map((date) => ({
        date,
        label: WEEKDAYS[parseISODate(date).getUTCDay()] ?? "",
        spent: sum(expenses.filter((row) => row.date === date)),
      }))
    : [];

  return {
    start: bounds.start,
    end: bounds.end,
    spent,
    income: incomeTotal,
    transfers: transferTotal,
    credits: roundMoney(incomeTotal + transferTotal),
    net: roundMoney(incomeTotal + transferTotal - spent),
    expenseCount: expenses.length,
    creditCount: income.length + transfers.length,
    byCategory,
    daily,
  };
}

export function summarize(rows: LedgerAmount[], today = todayInKathmandu()) {
  const weekBoundsForToday = weekBounds(today);
  const monthBoundsForToday = monthBounds(today);
  return {
    today,
    timezone: "Asia/Kathmandu" as const,
    totalCount: rows.length,
    week: rollup(rows, weekBoundsForToday, true),
    month: rollup(rows, monthBoundsForToday, false),
  };
}
