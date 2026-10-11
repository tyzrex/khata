"use client";

import { ArrowRightLeft, Landmark, Receipt } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type { ShareBook } from "@/db/shares";
import { useDateFormat } from "@/components/use-date-style";
import { formatNpr } from "@/lib/format";

type Expense = ShareBook["expenses"][number];
type Settlement = ShareBook["settlements"][number];

type Item = { kind: "expense"; date: string; id: string; expense: Expense } | { kind: "settlement"; date: string; id: string; settlement: Settlement };

const modeLabel: Record<Expense["splitMode"], string> = { equal: "Split equally", exact: "Exact amounts", shares: "By shares", percent: "By percent" };

/** What an expense did to you: lent the others' part, borrowed your part, or nothing. */
function yourSide(expense: Expense, selfId: string) {
  const mine = expense.splits.find((split) => split.personId === selfId)?.amount ?? 0;
  if (expense.paidById === selfId) {
    const lent = expense.amount - mine;
    return lent > 0.005 ? { tone: "owed" as const, label: "you lent", amount: lent } : { tone: "none" as const, label: "your own", amount: mine };
  }
  return mine > 0.005 ? { tone: "owe" as const, label: "you borrowed", amount: mine } : { tone: "none" as const, label: "not involved", amount: 0 };
}

function groupByDay(items: Item[]) {
  const days: { date: string; items: Item[] }[] = [];
  for (const item of items) {
    const last = days.at(-1);
    if (last && last.date === item.date) last.items.push(item);
    else days.push({ date: item.date, items: [item] });
  }
  return days;
}

export function ActivityView({
  book,
  onEditExpense,
  onEditSettlement,
}: {
  book: ShareBook;
  onEditExpense: (expense: Expense) => void;
  onEditSettlement: (settlement: Settlement) => void;
}) {
  const dates = useDateFormat();
  const items: Item[] = [
    ...book.expenses.map((expense) => ({ kind: "expense" as const, date: expense.date, id: expense.id, expense })),
    ...book.settlements.map((settlement) => ({ kind: "settlement" as const, date: settlement.date, id: settlement.id, settlement })),
  ].sort((a, b) => b.date.localeCompare(a.date) || (a.kind === b.kind ? 0 : a.kind === "settlement" ? -1 : 1));
  const days = groupByDay(items);

  return (
    <div className="rise flex flex-col gap-6">
      <PageHeader eyebrow="Shared history" title="Activity" description="Shared expenses and the payments that settled them. Bank imports are not listed here." />
      {items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No shared history</EmptyTitle>
            <EmptyDescription>Add a shared expense from a group, or record a settlement.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ol className="flex max-w-4xl flex-col gap-5">
          {days.map((day) => (
            <li key={day.date}>
              <h2 className="deva mb-2 flex items-baseline justify-between px-1 text-xs font-semibold text-muted-foreground">
                <span>{dates.entry(day.date)}</span>
                <span className="font-medium text-disabled">
                  {day.items.length} {day.items.length === 1 ? "entry" : "entries"}
                </span>
              </h2>
              <ul className="divide-y divide-border rounded-3xl bg-card p-1.5 shadow-card">
                {day.items.map((item) =>
                  item.kind === "expense" ? (
                    <ExpenseRow key={item.id} expense={item.expense} selfId={book.self.id} onOpen={() => onEditExpense(item.expense)} />
                  ) : (
                    <SettlementRow key={item.id} settlement={item.settlement} selfId={book.self.id} onOpen={() => onEditSettlement(item.settlement)} />
                  ),
                )}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ExpenseRow({ expense, selfId, onOpen }: { expense: Expense; selfId: string; onOpen: () => void }) {
  const side = yourSide(expense, selfId);
  const payer = expense.paidById === selfId ? "You" : expense.paidByName;
  return (
    <li>
      <button type="button" className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors duration-200 outline-none hover:bg-secondary focus-visible:bg-secondary" onClick={onOpen}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground" aria-hidden>
          <Receipt className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-display">{expense.description}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {payer} paid {formatNpr(expense.amount)}
            {expense.groupName ? ` · ${expense.groupName}` : ""} · {modeLabel[expense.splitMode]}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="text-[11px] font-medium text-muted-foreground">{side.label}</span>
          {side.tone === "none" ? (
            <span className="figure text-sm text-muted-foreground">{side.amount ? formatNpr(side.amount) : "—"}</span>
          ) : (
            <span className={side.tone === "owed" ? "figure text-sm text-credit" : "figure text-sm text-warning"}>{formatNpr(side.amount)}</span>
          )}
        </span>
      </button>
    </li>
  );
}

function SettlementRow({ settlement, selfId, onOpen }: { settlement: Settlement; selfId: string; onOpen: () => void }) {
  const bank = settlement.transaction;
  const from = settlement.fromPersonId === selfId ? "You" : settlement.fromName;
  const to = settlement.toPersonId === selfId ? "you" : settlement.toName;
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-start gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors duration-200 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onOpen}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-credit/12 text-credit" aria-hidden>
          <ArrowRightLeft className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-display">
            {from} paid {to}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            Settlement{settlement.groupName ? ` · ${settlement.groupName}` : ""}
          </span>
          {bank ? (
            <span className="mt-1 flex items-center gap-1.5 text-xs text-disabled">
              <Landmark className="size-3 shrink-0" aria-hidden />
              <span className="truncate">
                {bank.merchant} {formatNpr(bank.amount)}
                {bank.amount !== settlement.amount ? ` · ${formatNpr(Math.abs(bank.amount - settlement.amount))} apart` : ""}
              </span>
            </span>
          ) : null}
          {settlement.note ? <span className="mt-1 block text-xs leading-5 text-muted-foreground">{settlement.note}</span> : null}
        </span>
        <span className="figure shrink-0 text-sm text-credit">{formatNpr(settlement.amount)}</span>
      </button>
    </li>
  );
}
