"use client";

import { ArrowDownRight, ArrowUpRight, CircleCheck, HandCoins, Info, Plus, TriangleAlert, Wallet } from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { CardHead } from "@/components/card-head";
import { NotificationFeedCard } from "@/components/notification-feed-card";
import { CashFlowChart } from "@/components/cash-flow-chart";
import { DateRangeBar } from "@/components/date-range-bar";
import { PageHeader } from "@/components/page-header";
import { Donut } from "@/components/donut";
import { SegmentBar } from "@/components/segment-bar";
import { Sparkline } from "@/components/sparkline";
import { Button } from "@/components/ui/button";
import type { BalanceScope, ShareBook } from "@/db/shares";
import { SWATCHES } from "@/lib/constants";
import {
  accountBalances,
  balanceTrail,
  change,
  computeStats,
  dataBounds,
  describeRange,
  previousRange,
  rangeFor,
  shiftAnchor,
  type DateRange,
  type RangeKind,
} from "@/lib/dashboard";
import { useDateFormat } from "@/components/use-date-style";
import { formatAmount, formatNpr } from "@/lib/format";
import type { DashboardState } from "@/lib/url-state";
import type { AccountDto, CategoryDto, TransactionDto } from "@/lib/types";

type Debt = BalanceScope["youOwe"][number];

/** Account dots on the brand card, largest balance first: white at falling strength. */
/* Dots marking which holding is which. Brand-tinted rather than white: the hero is a
 * normal card now, and these step from the accent down on whichever surface it sits. */
const HOLDING_TONES = ["bg-brand", "bg-brand/60", "bg-brand/35", "bg-brand/20"] as const;

const compareLabels: Record<RangeKind, string> = {
  week: "last week",
  month: "last month",
  year: "last year",
  all: "",
  custom: "the period before",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

function sum(debts: Debt[]) {
  return debts.reduce((total, debt) => total + debt.amount, 0);
}

function Delta({ value, good }: { value: number | null; good: "up" | "down" }) {
  if (value == null) return null;
  const percent = Math.round(Math.abs(value) * 100);
  if (percent === 0) return <span className="font-semibold text-muted-foreground">No change</span>;
  const up = value > 0;
  const fine = up === (good === "up");
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${fine ? "text-credit" : "text-negative"}`}>
      <Icon className="size-3.5" aria-hidden />
      {percent}%
    </span>
  );
}

/** Spend change for one category against the period before: up is bad, so up is red. */
function CategoryDelta({ now, before, hasPrevious }: { now: number; before?: number; hasPrevious: boolean }) {
  if (!hasPrevious) return null;
  if (!before) return <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">New</span>;
  const delta = (now - before) / before;
  if (Math.abs(delta) < 0.05) return null;
  return (
    <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${delta > 0 ? "text-negative" : "text-credit"}`} title="Against the period before">
      {delta > 0 ? "↑" : "↓"}
      {Math.round(Math.abs(delta) * 100)}%
    </span>
  );
}

/** One cell of the period statement: label, the figure, and a quiet footnote. */
/**
 * Per-bucket micro columns under a figure: the shape of the period at a glance.
 * The peak takes the full tone; the rest sit at a third of it. Buckets after today stay empty.
 */
function MicroBars({ values, tone, lived }: { values: number[]; tone: "brand" | "credit"; lived: number }) {
  const peak = Math.max(...values, 0);
  if (peak === 0) return <div className="h-full w-full border-b-2 border-dotted border-secondary" aria-hidden />;
  const top = values.indexOf(peak);
  const full = tone === "brand" ? "bg-brand" : "bg-credit";
  const soft = tone === "brand" ? "bg-brand/30" : "bg-credit/30";
  return (
    <div className="flex h-full max-h-14 min-h-8 w-full items-end gap-[2px]" aria-hidden>
      {values.map((value, index) => (
        <span
          key={index}
          className={`min-w-px flex-1 rounded-t-[2px] ${index >= lived ? "bg-secondary" : index === top ? full : value > 0 ? soft : "bg-secondary"}`}
          style={{ height: index >= lived || value === 0 ? 2 : `${Math.max((value / peak) * 100, 8)}%` }}
        />
      ))}
    </div>
  );
}

/**
 * A figure that keeps every digit. Inside an `@container` it shrinks to the width
 * available instead of truncating, breaking mid-number, or spilling out of the card.
 * The className sets the largest size as `min(<size>, var(--fit))`.
 */
function Fit({ text, className, reserve = 0 }: { text: string; className: string; reserve?: number }) {
  // 175cqi: these figures average about 0.54em a character, so this leaves a little room.
  return (
    <span className={`block whitespace-nowrap ${className}`} style={{ "--fit": `calc(175cqi / ${text.length + reserve})` } as CSSProperties}>
      {text}
    </span>
  );
}

function Figure({ label, value, foot, badge, tone, className, chart }: { label: string; value: string; foot: ReactNode; badge?: string; tone?: string; className?: string; chart?: ReactNode }) {
  return (
    <div className={`@container flex min-w-0 flex-col border-border p-4 sm:p-5 2xl:p-6 ${className ?? ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="label">{label}</p>
        {badge ? <span className="text-xs font-semibold text-muted-foreground tabular-nums">{badge}</span> : null}
      </div>
      <Fit text={value} className={`figure mt-2 text-[length:min(1.25rem,var(--fit))] leading-tight sm:text-[length:min(1.5rem,var(--fit))] 2xl:text-[length:min(28px,var(--fit))] ${tone ?? "text-display"}`} />
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{foot}</div>
      {chart ? <div className="mt-4 flex min-h-8 flex-1 items-end">{chart}</div> : null}
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Overview({
  transactions,
  categories,
  accounts: ledgerAccounts,
  today,
  book,
  period,
  onPeriod,
  onLedger,
  onAdd,
  onSplit,
  onSample,
  onBalances,
  onFriends,
  onGroups,
}: {
  /** Every transaction, unfiltered. */
  transactions: TransactionDto[];
  categories: CategoryDto[];
  accounts: AccountDto[];
  today: string;
  book: ShareBook | null;
  /** The period shown. It lives in the URL; see readDashboardState. */
  period: DashboardState;
  onPeriod: (next: DashboardState) => void;
  onLedger: () => void;
  onAdd: () => void;
  onSplit: () => void;
  onSample: () => Promise<void>;
  onBalances: () => void;
  onFriends: () => void;
  onGroups: () => void;
}) {
  const dates = useDateFormat();
  const { style } = dates;
  const { kind, anchor, custom } = period;
  const setKind = (next: RangeKind) => onPeriod({ ...period, kind: next });
  const setAnchor = (next: string) => onPeriod({ ...period, anchor: next });
  const setCustom = (next: DateRange) => onPeriod({ ...period, kind: "custom", custom: next });
  const [sampling, setSampling] = useState(false);
  const [slice, setSlice] = useState<string | null>(null);

  const rows = useMemo(
    () => transactions.map((row) => ({ date: row.date, type: row.type, amount: row.amount, category: row.category, merchant: row.merchant, account: row.account })),
    [transactions],
  );
  const bounds = useMemo(() => dataBounds(rows, today), [rows, today]);
  const range = useMemo(() => rangeFor(kind, anchor, { custom, all: bounds }, style.calendar), [kind, anchor, custom, bounds, style.calendar]);
  const stats = useMemo(() => computeStats(rows, range, today, style), [rows, range, today, style]);
  const previous = useMemo(() => (kind === "all" ? null : computeStats(rows, previousRange(kind, range, style.calendar), today, style)), [rows, kind, range, today, style]);
  const accounts = useMemo(() => accountBalances(rows, ledgerAccounts), [rows, ledgerAccounts]);
  const trail = useMemo(() => balanceTrail(rows, stats.series, stats.range.end, today), [rows, stats, today]);
  const colors = useMemo(() => new Map(categories.map((category) => [category.name, category.color])), [categories]);

  const label = describeRange(kind, range, style);
  const stepping = kind === "week" || kind === "month" || kind === "year";
  const compare = compareLabels[kind];

  if (transactions.length === 0) {
    return (
      <section className="rise flex flex-col items-start gap-8 rounded-3xl bg-card shadow-card p-8 sm:p-12">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <Wallet className="size-6" />
        </span>
        <div className="flex max-w-md flex-col gap-3">
          <h1 className="display text-4xl">
            Nothing here yet
            <span className="block text-disabled">Start with a sample week</span>
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">Load the sample week to see the dashboard filled in, or write your first entry yourself.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            size="lg"
            disabled={sampling}
            onClick={() => {
              setSampling(true);
              void onSample().finally(() => setSampling(false));
            }}
          >
            {sampling ? "Loading sample" : "Load sample week"}
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={onAdd}>
            Add an entry
          </Button>
        </div>
      </section>
    );
  }

  // What you have: every credit minus every expense, across all accounts and all time.
  const balance = accounts.reduce((total, account) => total + account.balance, 0);
  const balanceText = `${balance < 0 ? "−" : ""}${formatAmount(balance)}`;
  const tileFigure = "figure mt-1.5 text-[length:min(1.125rem,var(--fit))] leading-snug";
  // Opening balance is the first close minus that bucket's own movement.
  const first = stats.series[0];
  const lived = stats.series.filter((bucket) => bucket.key <= today).length;
  const trailMove = trail.length > 0 && first ? trail.at(-1)!.balance - (trail[0]!.balance - (first.credits - first.spent)) : null;
  const holdings = accounts.filter((account) => account.balance > 0).sort((a, b) => b.balance - a.balance);
  const owe = book ? sum(book.overall.youOwe) + book.joinedGroups.reduce((total, group) => total + sum(group.balances.youOwe), 0) : null;
  const owed = book ? sum(book.overall.youAreOwed) + book.joinedGroups.reduce((total, group) => total + sum(group.balances.youAreOwed), 0) : null;
  const afterSplits = owe == null || owed == null ? null : balance + owed - owe;

  const people = new Map<string, number>();
  if (book) {
    const scopes = [book.overall, ...book.joinedGroups.map((group) => group.balances)];
    for (const scope of scopes) {
      for (const debt of scope.youAreOwed) people.set(debt.fromName, (people.get(debt.fromName) ?? 0) + debt.amount);
      for (const debt of scope.youOwe) people.set(debt.toName, (people.get(debt.toName) ?? 0) - debt.amount);
    }
  }
  const peopleRows = [...people.entries()]
    .filter(([, net]) => Math.abs(net) >= 0.005)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5);

  const groupRows = book
    ? [
        ...book.groups.filter((group) => group.kind === "group").map((group) => ({ id: group.id, name: group.name, members: group.members.length, net: sum(group.balances.youAreOwed) - sum(group.balances.youOwe) })),
        ...book.joinedGroups.filter((group) => group.kind === "group").map((group) => ({ id: group.id, name: group.name, members: group.members.length, net: sum(group.balances.youAreOwed) - sum(group.balances.youOwe) })),
      ]
    : [];

  const inPeriod = transactions.filter((row) => row.date >= range.start && row.date <= range.end);
  const recent = (inPeriod.length ? inPeriod : transactions).slice(0, 8);
  const empty = stats.expenseCount + stats.creditCount === 0;
  const latest = transactions[0]?.date;

  const slices = stats.byCategory.map((slice, index) => ({
    name: slice.category,
    value: slice.amount,
    color: colors.get(slice.category) ?? SWATCHES[index % SWATCHES.length]!,
  }));
  const topSlices = slices.slice(0, 6);
  const restValue = slices.slice(6).reduce((total, slice) => total + slice.value, 0);
  const donutSlices = restValue > 0 ? [...topSlices, { name: "Everything else", value: restValue, color: "#a3a3ab" }] : topSlices;
  const activeSlice = donutSlices.find((item) => item.name === slice);
  const before = new Map(previous?.byCategory.map((item) => [item.category, item.amount]) ?? []);

  const spentChange = previous ? change(stats.spent, previous.spent) : null;
  const creditChange = previous ? change(stats.credits, previous.credits) : null;
  const maxAccount = Math.max(...accounts.map((account) => Math.abs(account.balance)), 1);

  const insights: { tone: "good" | "warn" | "info"; text: string }[] = [];
  if (spentChange != null && compare) {
    const percent = Math.round(Math.abs(spentChange) * 100);
    if (percent > 0) insights.push({ tone: spentChange > 0 ? "warn" : "good", text: `You spent ${percent}% ${spentChange > 0 ? "more" : "less"} than ${compare}.` });
  }
  if (stats.credits > 0 && stats.net < 0) insights.push({ tone: "warn", text: `You spent ${formatNpr(-stats.net)} more than came in this period.` });
  else if (stats.savingsRate != null && stats.savingsRate > 0) insights.push({ tone: "good", text: `You kept ${Math.round(stats.savingsRate * 100)}% of what came in.` });
  else if (stats.credits === 0 && stats.spent > 0) insights.push({ tone: "info", text: "Nothing came in this period, so every rupee spent came out of savings." });
  const top = stats.byCategory[0];
  if (top) insights.push({ tone: "info", text: `${top.category} is your biggest category at ${Math.round(top.share * 100)}% of spending.` });
  if (stats.projected != null) insights.push({ tone: stats.projected > stats.spent * 1.5 ? "warn" : "info", text: `At ${formatNpr(Math.round(stats.avgDaily))} a day you will spend about ${formatNpr(Math.round(stats.projected))} by ${describeRange("custom", { start: stats.range.end, end: stats.range.end }, style)}.` });
  if (stats.biggest) insights.push({ tone: "info", text: `Biggest expense: ${stats.biggest.merchant}, ${formatNpr(stats.biggest.amount)} on ${dates.entry(stats.biggest.date)}.` });
  if (owed != null && owed > 0) insights.push({ tone: "good", text: `Friends owe you ${formatNpr(owed)}. Settle up to bring it in.` });
  if (owe != null && owe > 0) insights.push({ tone: "warn", text: `You owe ${formatNpr(owe)} to friends and groups.` });
  const toneMark = {
    good: { icon: CircleCheck, className: "text-credit", label: "Good" },
    warn: { icon: TriangleAlert, className: "text-warning", label: "Watch" },
    info: { icon: Info, className: "text-muted-foreground", label: "Note" },
  } as const;

  const maxMerchant = stats.topMerchants[0]?.amount ?? 0;

  return (
    <div className="rise flex flex-col gap-3 2xl:gap-4">
      <PageHeader
        wide
        className="mb-2"
        eyebrow={
          <>
            <span className="lg:hidden">Overview</span>
            <span className="hidden lg:inline">{today ? dates.long(today) : "Overview"}</span>
          </>
        }
        title="Dashboard"
        aside={
          <span className="flex items-center gap-2 lg:hidden">
            <Button type="button" size="icon" aria-label="Add entry" onClick={onAdd}>
              <Plus className="size-[18px]" />
            </Button>
            <Button type="button" variant="outline" size="icon" className="bg-card shadow-card" aria-label="Split an expense" onClick={onSplit}>
              <HandCoins className="size-[18px]" />
            </Button>
          </span>
        }
        actions={
          <DateRangeBar
            kind={kind}
            label={label}
            today={today}
            anchor={anchor}
            custom={custom}
            canNext={range.end < today}
            onKind={setKind}
            onShift={(direction) => setAnchor(shiftAnchor(kind, anchor, direction, style.calendar))}
            onAnchor={setAnchor}
            onCustom={setCustom}
          />
        }
      />

      {empty && stepping && latest ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-accent px-5 py-4">
          <p className="text-sm font-medium text-accent-foreground">Nothing recorded in {label}.</p>
          <Button type="button" size="sm" onClick={() => setAnchor(latest)}>
            Jump to your latest entry
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 2xl:gap-4">
        <section className="@container relative flex flex-col overflow-hidden rounded-3xl bg-card p-5 text-card-foreground shadow-card sm:p-6 xl:col-span-4 2xl:col-span-3 2xl:p-7">
          {/* The brand as light falling on the card rather than filling it. Decorative, so it is hidden from assistive tech. */}
          <span aria-hidden className="hero-bloom hero-bloom-a" />
          <span aria-hidden className="hero-bloom hero-bloom-b" />
          <p className="relative text-[13px] font-medium text-muted-foreground">What you have</p>
          <p className="dotmatrix relative mt-3 flex min-w-0 flex-wrap items-baseline gap-x-2 !text-display">
            <Fit text={balanceText} reserve={3} className="text-[length:min(30px,var(--fit))] sm:text-[length:min(34px,var(--fit))] 2xl:text-[length:min(40px,var(--fit))]" />
            <span className="text-sm font-semibold tracking-normal text-muted-foreground">NPR</span>
          </p>
          {trailMove != null ? (
            <p className={`relative mt-2 text-xs font-medium tabular-nums ${trailMove >= 0 ? "text-credit" : "text-warning"}`}>
              {trailMove >= 0 ? "+" : "−"}
              {formatNpr(Math.abs(trailMove))} this period
            </p>
          ) : null}
          <Sparkline values={trail.map((point) => point.balance)} id="hero-trail" className="relative mt-3 h-8 text-brand-tint sm:h-9" />
          <div className="relative mt-auto pt-4">
            {holdings.length > 0 ? (
              <>
                <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  {holdings.slice(0, 3).map((account, index) => (
                    <li key={account.account} className="flex min-w-0 items-center gap-1.5">
                      <span className={`size-1.5 shrink-0 rounded-full ${HOLDING_TONES[Math.min(index, HOLDING_TONES.length - 1)]}`} aria-hidden />
                      <span className="truncate font-medium text-display">{account.account}</span>
                      <span className="tabular-nums">{formatAmount(account.balance)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
              </p>
            )}
            {afterSplits != null && owe != null && owed != null && (owe > 0 || owed > 0) ? <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">{formatNpr(afterSplits)} once splits settle</p> : null}
          </div>
        </section>

        <section className="grid grid-cols-2 rounded-3xl bg-card shadow-card sm:grid-cols-3 xl:col-span-8 2xl:col-span-9">
          <Figure className="border-r" label="Money in" value={formatNpr(stats.credits)} chart={<MicroBars values={stats.series.map((bucket) => bucket.credits)} tone="credit" lived={lived} />} foot={<><Delta value={creditChange} good="up" /> {compare && creditChange != null ? `vs ${compare}` : `${stats.creditCount} ${stats.creditCount === 1 ? "entry" : "entries"}`}</>} />
          <Figure className="sm:border-r" label="Money out" value={formatNpr(stats.spent)} chart={<MicroBars values={stats.series.map((bucket) => bucket.spent)} tone="brand" lived={lived} />} foot={<><Delta value={spentChange} good="down" /> {compare && spentChange != null ? `vs ${compare}` : `${stats.expenseCount} ${stats.expenseCount === 1 ? "expense" : "expenses"}`}</>} />
          <Figure
            className="col-span-2 border-t sm:col-span-1 sm:border-t-0"
            label="Kept"
            value={formatNpr(stats.net)}
            tone={stats.net < 0 ? "text-negative" : undefined}
            badge={stats.savingsRate == null ? undefined : stats.savingsRate < 0 ? `Spent ${Math.round((stats.spent / stats.credits) * 100)}% of income` : `${Math.round(stats.savingsRate * 100)}% of income`}
            foot={stats.credits === 0 ? "No money in yet" : stats.net < 0 ? "Spending is above income" : "Money in minus money out"}
            chart={<SegmentBar size="compact" tone={stats.net < 0 ? "over" : "neutral"} value={stats.savingsRate == null ? 0 : stats.net < 0 ? 1 : stats.savingsRate} />}
          />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 2xl:gap-4">
        <section className="rounded-3xl bg-card shadow-card p-4 sm:p-5 2xl:p-6 xl:col-span-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardHead title="Cash flow" hint={stats.granularity === "day" ? "Spending by day, or how it is pacing" : "Spending by month, or how it is pacing"} />
          </div>
          <div className="mt-3">
            <CashFlowChart buckets={stats.series} previous={previous?.series} compareLabel={compare || undefined} today={today} average={stats.granularity === "day" ? stats.avgDaily : undefined} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-4">
            <div className="@container min-w-0">
              <dt className="label">Average a day</dt>
              <dd>
                <Fit text={formatNpr(Math.round(stats.avgDaily))} className={`${tileFigure} mt-1 text-display`} />
              </dd>
            </div>
            <div className="@container min-w-0">
              <dt className="label">{stats.projected != null ? "On pace for" : "Total spent"}</dt>
              <dd>
                <Fit text={formatNpr(Math.round(stats.projected ?? stats.spent))} className={`${tileFigure} mt-1 text-display`} />
              </dd>
            </div>
            <div className="@container min-w-0">
              <dt className="label">Biggest expense</dt>
              <dd>
                <Fit text={stats.biggest ? formatNpr(stats.biggest.amount) : "—"} className={`${tileFigure} mt-1 text-display`} />
              </dd>
            </div>
            <div>
              <dt className="label">Entries</dt>
              <dd className="figure mt-1 text-lg text-display">{stats.expenseCount + stats.creditCount}</dd>
            </div>
          </dl>
        </section>

        <section className="flex flex-col rounded-3xl bg-card shadow-card p-4 sm:p-5 2xl:p-6 xl:col-span-4">
          <CardHead title="Where it went" hint={`${stats.byCategory.length} ${stats.byCategory.length === 1 ? "category" : "categories"}`} />
          {stats.byCategory.length === 0 ? (
            <Empty>No expenses in this period.</Empty>
          ) : (
            <div className="mt-4 flex flex-1 flex-col items-center gap-5 sm:flex-row sm:items-center xl:flex-col xl:items-stretch min-[1800px]:flex-row min-[1800px]:items-center">
              <div className="flex justify-center">
                <Donut slices={donutSlices} size={164} thickness={18} active={slice} onActive={setSlice}>
                  {activeSlice ? (
                    <>
                      <span className="max-w-full truncate text-xs font-medium text-muted-foreground">{activeSlice.name}</span>
                      <span className="figure mt-0.5 text-lg text-display">{formatNpr(activeSlice.value)}</span>
                      <span className="mt-0.5 text-xs font-semibold text-muted-foreground tabular-nums">{Math.round((activeSlice.value / stats.spent) * 100)}% of spend</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-medium text-muted-foreground">Spent</span>
                      <span className="figure mt-0.5 text-lg text-display">{formatNpr(stats.spent)}</span>
                      <span className="mt-0.5 text-xs text-muted-foreground">
                        {stats.expenseCount} {stats.expenseCount === 1 ? "expense" : "expenses"}
                      </span>
                    </>
                  )}
                </Donut>
              </div>
              <ul className="flex w-full min-w-0 flex-col gap-1" onPointerLeave={() => setSlice(null)}>
                {donutSlices.map((item) => {
                  const share = item.value / stats.spent;
                  const dim = slice != null && slice !== item.name;
                  return (
                    <li key={item.name}>
                      <button
                        type="button"
                        className={`w-full rounded-xl px-2 py-1.5 text-left transition-[background-color,opacity] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring ${slice === item.name ? "bg-secondary" : ""} ${dim ? "opacity-45" : ""}`}
                        onPointerEnter={() => setSlice(item.name)}
                        onFocus={() => setSlice(item.name)}
                        onBlur={() => setSlice(null)}
                      >
                        <span className="flex items-center gap-2.5 text-sm">
                          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: item.color }} aria-hidden />
                          <span className="min-w-0 flex-1 truncate font-medium text-display">{item.name}</span>
                          <span className="figure shrink-0 text-right text-[13px] whitespace-nowrap text-display">{formatNpr(item.value)}</span>
                        </span>
                        <span className="mt-1 ml-5 flex items-center gap-2">
                          <span className="block h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
                            <span className="block h-full rounded-full" style={{ width: `${Math.max(share * 100, 2)}%`, background: item.color }} />
                          </span>
                          <CategoryDelta now={item.value} before={before.get(item.name)} hasPrevious={previous != null && item.name !== "Everything else"} />
                          <span className="w-9 shrink-0 text-right text-xs font-semibold text-muted-foreground tabular-nums">{Math.round(share * 100)}%</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 2xl:gap-4">
        <section className="flex flex-col rounded-3xl bg-card shadow-card p-4 sm:p-5 2xl:p-6 xl:col-span-4">
          <CardHead title="Splits" hint="Who owes whom" action="Balances" onAction={onBalances} />
          {book == null ? (
            <Empty>Loading splits…</Empty>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="@container min-w-0 rounded-2xl bg-secondary p-3">
                  <p className="label">You owe</p>
                  <Fit text={formatNpr(owe ?? 0)} className={`${tileFigure} ${owe ? "text-warning" : "text-muted-foreground"}`} />
                </div>
                <div className="@container min-w-0 rounded-2xl bg-accent p-3">
                  {/* Same `label` as the tile beside it. accent-foreground/70 was 1.3:1 on the navy tile. */}
                  <p className="label">You are owed</p>
                  <Fit text={formatNpr(owed ?? 0)} className={`${tileFigure} ${owed ? "text-credit" : "text-muted-foreground"}`} />
                </div>
              </div>
              {peopleRows.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
                  <p className="text-sm text-muted-foreground">Everyone is square. Split a bill to start a balance.</p>
                  <Button type="button" variant="outline" size="sm" onClick={onSplit}>
                    <HandCoins />
                    Split expense
                  </Button>
                </div>
              ) : (
                <ul className="mt-4 divide-y divide-border">
                  {peopleRows.map(([name, net]) => (
                    <li key={name} className="flex items-center gap-3 py-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground" aria-hidden>
                        {initials(name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-display">{name}</span>
                        <span className="block text-xs text-muted-foreground">{net > 0 ? "owes you" : "you owe"}</span>
                      </span>
                      <span className={`figure shrink-0 text-sm ${net > 0 ? "text-credit" : "text-warning"}`}>{formatNpr(Math.abs(net))}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto flex gap-2 pt-4">
                <Button type="button" className="flex-1" onClick={onBalances}>
                  Settle up
                </Button>
                <Button type="button" variant="outline" onClick={onFriends}>
                  Friends
                </Button>
              </div>
            </>
          )}
        </section>

        <section className="rounded-3xl bg-card shadow-card p-4 sm:p-5 2xl:p-6 xl:col-span-4">
          <CardHead title="Accounts" hint="Money in minus money out, all time" />
          {accounts.length === 0 ? (
            <Empty>No accounts yet.</Empty>
          ) : (
            <ul className="mt-4 flex flex-col gap-4">
              {accounts.map((account) => (
                <li key={account.account}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold text-display">{account.account}</span>
                    <span className={`figure shrink-0 text-sm ${account.balance < 0 ? "text-negative" : "text-display"}`}>
                      {account.balance < 0 ? "−" : ""}
                      {formatNpr(Math.abs(account.balance))}
                    </span>
                  </div>
                  <SegmentBar className="mt-2" size="compact" tone={account.balance < 0 ? "over" : "neutral"} value={Math.abs(account.balance) / maxAccount} />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {formatNpr(account.credits)} in · {formatNpr(account.spent)} out
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl bg-card shadow-card p-4 sm:p-5 2xl:p-6 xl:col-span-4">
          <CardHead title="What stands out" hint="Read from this period" />
          {insights.length === 0 ? (
            <Empty>Add a few entries and this fills in.</Empty>
          ) : (
            <ol className="mt-3 divide-y divide-border">
              {insights.slice(0, 5).map((insight) => {
                const { icon: Icon, className, label: toneLabel } = toneMark[insight.tone];
                return (
                  <li key={insight.text} className="flex gap-3 py-2.5 text-[13px] leading-5 text-pretty text-foreground">
                    <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-label={toneLabel} />
                    <span>{insight.text}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 2xl:gap-4">
        <section className="rounded-3xl bg-card shadow-card p-4 sm:p-5 2xl:p-6 xl:col-span-7">
          <CardHead title={inPeriod.length ? "Recent transactions" : "Latest transactions"} hint={inPeriod.length ? "In this period" : "Nothing in this period yet"} action="See all" onAction={onLedger} />
          <ul className="mt-3 divide-y divide-border">
            {recent.map((transaction) => {
              const incoming = transaction.type !== "expense";
              return (
                <li key={transaction.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground" aria-hidden>
                    {initials(transaction.merchant)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-display">{transaction.merchant}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {transaction.category} · {transaction.account}
                    </span>
                  </span>
                  <span className="deva hidden w-36 shrink-0 text-right text-xs text-muted-foreground sm:block">{dates.entry(transaction.date)}</span>
                  <span className={incoming ? "figure min-w-32 shrink-0 text-right text-sm whitespace-nowrap text-credit" : "figure min-w-32 shrink-0 text-right text-sm whitespace-nowrap text-display"}>
                    {formatNpr(transaction.amount, incoming ? "in" : "out")}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="flex flex-col gap-4 xl:col-span-5 2xl:gap-5">
          <NotificationFeedCard />

          <section className="rounded-3xl bg-card shadow-card p-4 sm:p-5 2xl:p-6">
            <CardHead title="Top merchants" hint="Where the money went most" />
            {stats.topMerchants.length === 0 ? (
              <Empty>No spending in this period.</Empty>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {stats.topMerchants.map((merchant) => (
                  <li key={merchant.merchant}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-sm font-semibold text-display">{merchant.merchant}</span>
                        <span className="shrink-0 text-xs font-medium text-muted-foreground">{merchant.count}×</span>
                      </span>
                      <span className="figure shrink-0 text-sm text-display">{formatNpr(merchant.amount)}</span>
                    </div>
                    <SegmentBar className="mt-2" size="compact" value={maxMerchant ? merchant.amount / maxMerchant : 0} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-3xl bg-card shadow-card p-4 sm:p-5 2xl:p-6">
            <CardHead title="Groups" hint="Shared books you are in" action="Open groups" onAction={onGroups} />
            {groupRows.length === 0 ? (
              <Empty>No groups yet. Create one to split trips and rent.</Empty>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {groupRows.slice(0, 4).map((group) => (
                  <li key={group.id} className="flex items-center gap-3 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground" aria-hidden>
                      {initials(group.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-display">{group.name}</span>
                      <span className="block text-xs text-muted-foreground">{group.members} members</span>
                    </span>
                    <span className={`shrink-0 ${Math.abs(group.net) < 0.005 ? "text-xs font-medium text-muted-foreground" : group.net > 0 ? "figure text-sm text-credit" : "figure text-sm text-warning"}`}>
                      {Math.abs(group.net) < 0.005 ? "Settled" : `${group.net > 0 ? "+" : "−"}${formatNpr(Math.abs(group.net))}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
