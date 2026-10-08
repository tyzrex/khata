"use client";

import { ArrowLeft, HandCoins, Receipt } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import type { ShareBook } from "@/db/shares";
import { useDateFormat } from "@/components/use-date-style";
import { formatNpr } from "@/lib/format";

/** Shared pieces for the Friends and Groups books: cards, avatars, balance readouts and history rows. */

type Expense = ShareBook["expenses"][number];
type Settlement = ShareBook["settlements"][number];

/** Below this a balance counts as settled; amounts are rounded to paisa. */
export const SETTLED = 0.005;

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function SplitCard({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-3xl bg-card p-4 shadow-card sm:p-5 2xl:p-6", className)}>{children}</section>;
}

export function SplitCardHead({ title, hint, children }: { title: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] leading-5 font-semibold tracking-[-0.015em] text-display">{title}</h2>
        {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-1.5">{children}</div> : null}
    </div>
  );
}

const AVATAR_SIZE = { sm: "size-7 text-[10px]", md: "size-9 text-[11px]", lg: "size-12 text-sm" } as const;

/** Initials in a circle. `linked` adds a small brand dot: that person has their own Khata account. */
export function PersonAvatar({
  name,
  size = "md",
  tone = "neutral",
  linked = false,
  className,
}: {
  name: string;
  size?: keyof typeof AVATAR_SIZE;
  tone?: "neutral" | "accent" | "brand";
  linked?: boolean;
  className?: string;
}) {
  const fill = { neutral: "bg-secondary text-foreground", accent: "bg-accent text-accent-foreground", brand: "bg-brand text-brand-foreground" }[tone];
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center rounded-full font-semibold", AVATAR_SIZE[size], fill, className)} aria-hidden>
      {initials(name)}
      {linked ? <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-brand ring-2 ring-card" /> : null}
    </span>
  );
}

/** Overlapping avatars for a group, with a "+n" tail past `max`. */
export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className="flex items-center -space-x-1.5" aria-hidden>
      {shown.map((name, index) => (
        <PersonAvatar key={`${name}-${index}`} name={name} size="sm" className="ring-2 ring-card" />
      ))}
      {rest > 0 ? <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground ring-2 ring-card">+{rest}</span> : null}
    </span>
  );
}

/** Square tile with a group's initial: groups read as places, people as faces. */
export function GroupTile({ name, active = false, size = "md" }: { name: string; active?: boolean; size?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl font-semibold",
        size === "lg" ? "size-12 text-base" : "size-9 text-[13px]",
        active ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground",
      )}
      aria-hidden
    >
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

/** Positive: they owe you. Negative: you owe. Words and colour say the direction, never colour alone. */
export function netWords(value: number) {
  if (Math.abs(value) < SETTLED) return { label: "Settled up", tone: "text-muted-foreground" } as const;
  return value > 0 ? ({ label: "Owes you", tone: "text-credit" } as const) : ({ label: "You owe", tone: "text-warning" } as const);
}

/** Compact two-line readout for list rows: direction above, amount below. */
export function NetStack({ value, owesLabel = "owes you", oweLabel = "you owe" }: { value: number; owesLabel?: string; oweLabel?: string }) {
  if (Math.abs(value) < SETTLED) return <span className="shrink-0 text-xs font-medium text-muted-foreground">Settled</span>;
  const owed = value > 0;
  return (
    <span className="flex shrink-0 flex-col items-end leading-tight">
      <span className={cn("text-[11px] font-medium", owed ? "text-credit" : "text-warning")}>{owed ? owesLabel : oweLabel}</span>
      <span className={cn("figure mt-0.5 text-sm", owed ? "text-credit" : "text-warning")}>{formatNpr(Math.abs(value))}</span>
    </span>
  );
}

/** Three-cell statement: owed to you, you owe, and where that leaves you. */
export function BalanceStrip({
  owed,
  owe,
  owedHint,
  oweHint,
  third,
}: {
  owed: number;
  owe: number;
  owedHint?: ReactNode;
  oweHint?: ReactNode;
  third: { label: string; value: ReactNode; hint?: ReactNode };
}) {
  const net = owed - owe;
  const words = netWords(net);
  return (
    <section className="grid grid-cols-2 rounded-3xl bg-card shadow-card sm:grid-cols-3">
      <StripCell className="border-r" label="You are owed" value={<span className={owed > SETTLED ? "text-credit" : "text-display"}>{formatNpr(owed)}</span>} hint={owedHint} />
      <StripCell className="sm:border-r" label="You owe" value={<span className={owe > SETTLED ? "text-warning" : "text-display"}>{formatNpr(owe)}</span>} hint={oweHint} />
      <StripCell
        className="col-span-2 border-t sm:col-span-1 sm:border-t-0"
        label={third.label}
        value={third.value}
        hint={third.hint ?? <span className={words.tone}>{Math.abs(net) < SETTLED ? "Everyone is square" : `${net > 0 ? "Net owed to you" : "Net you owe"} ${formatNpr(Math.abs(net))}`}</span>}
      />
    </section>
  );
}

function StripCell({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 border-border p-4 sm:p-5", className)}>
      <p className="label">{label}</p>
      <p className="figure mt-2 truncate text-xl text-display sm:text-2xl">{value}</p>
      {hint ? <p className="mt-1.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Mobile-only way back from a detail pane to its list. */
export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 flex h-9 w-fit items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-display focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {label}
    </button>
  );
}

/**
 * What one expense means for you, Splitwise style: you lent the others their shares when you paid,
 * you borrowed your share when someone else did. `withId` narrows "the others" to one friend.
 */
function yourSide(expense: Expense, selfId: string, withId?: string) {
  const mine = expense.splits.find((split) => split.personId === selfId)?.amount ?? 0;
  if (expense.paidById === selfId) {
    const lent = withId ? (expense.splits.find((split) => split.personId === withId)?.amount ?? 0) : expense.amount - mine;
    return lent > SETTLED ? { text: "you lent", amount: lent, tone: "text-credit" } : null;
  }
  if (withId && expense.paidById !== withId) return null;
  return mine > SETTLED ? { text: "you borrowed", amount: mine, tone: "text-warning" } : null;
}

export type HistoryItem = { kind: "expense"; date: string; id: string; expense: Expense } | { kind: "settlement"; date: string; id: string; settlement: Settlement };

export function historyOf(expenses: Expense[], settlements: Settlement[]): HistoryItem[] {
  return [
    ...expenses.map((expense) => ({ kind: "expense" as const, date: expense.date, id: expense.id, expense })),
    ...settlements.map((settlement) => ({ kind: "settlement" as const, date: settlement.date, id: settlement.id, settlement })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}

/** Expenses and payments, newest first. Expenses open for editing; payments are read-only here. */
export function HistoryList({
  items,
  selfId,
  withId,
  hideGroup,
  onEditExpense,
}: {
  items: HistoryItem[];
  selfId: string;
  withId?: string;
  /** Group name not worth repeating on every row (the group being viewed, or a direct book). */
  hideGroup?: string;
  onEditExpense: (expense: Expense) => void;
}) {
  const dates = useDateFormat();
  return (
    <ul className="-mx-2 mt-2 flex flex-col">
      {items.map((item) => {
        if (item.kind === "expense") {
          const { expense } = item;
          const side = yourSide(expense, selfId, withId);
          const group = expense.groupName && expense.groupName !== hideGroup ? expense.groupName : null;
          return (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors duration-200 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onEditExpense(expense)}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground" aria-hidden>
                  <Receipt className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium text-display">{expense.description}</span>
                    {group ? <span className="hidden shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:inline">{group}</span> : null}
                  </span>
                  <span className="deva mt-0.5 block truncate text-xs text-muted-foreground">
                    {dates.entry(expense.date)} · {expense.paidById === selfId ? "You" : expense.paidByName} paid {formatNpr(expense.amount)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end leading-tight">
                  {side ? (
                    <>
                      <span className={cn("text-[11px] font-medium", side.tone)}>{side.text}</span>
                      <span className={cn("figure mt-0.5 text-sm", side.tone)}>{formatNpr(side.amount)}</span>
                    </>
                  ) : (
                    <span className="text-[11px] font-medium text-muted-foreground">no balance</span>
                  )}
                </span>
              </button>
            </li>
          );
        }
        const { settlement } = item;
        const from = settlement.fromPersonId === selfId ? "You" : settlement.fromName;
        const to = settlement.toPersonId === selfId ? "you" : settlement.toName;
        return (
          <li key={item.id} className="flex items-center gap-3 px-2 py-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-credit/10 text-credit" aria-hidden>
              <HandCoins className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-display">
                {from} paid {to}
              </span>
              <span className="deva mt-0.5 block truncate text-xs text-muted-foreground">
                {dates.entry(settlement.date)} · Settlement{settlement.note ? ` · ${settlement.note}` : ""}
              </span>
            </span>
            <span className="figure shrink-0 text-sm text-display">{formatNpr(settlement.amount)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm leading-6 text-pretty text-muted-foreground">{children}</p>;
}
