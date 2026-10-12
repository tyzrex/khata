"use client";

import { cn } from "cn";
import { HandCoins } from "lucide-react";
import { effectOf, runsBy, type Expense, type FeedItem, type Settlement, who } from "@/components/splits/ledger-math";
import { useDateFormat } from "@/components/use-date-style";
import { formatNpr } from "@/lib/format";
import { dateView } from "@/lib/nepali-date";

/** Day over month, like the stub of a receipt. Reads the person's calendar (AD or BS). */
function DateChip({ iso }: { iso: string }) {
  const { style } = useDateFormat();
  const view = dateView(iso, style);
  return (
    <span className="flex w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-secondary py-1.5 leading-none" aria-hidden>
      <span className="deva text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{view.monthShort}</span>
      <span className="figure mt-1 text-[17px] text-display">{view.num(view.day)}</span>
    </span>
  );
}

function EffectReadout({ expense, selfId, withId }: { expense: Expense; selfId: string; withId?: string }) {
  const effect = effectOf(expense, selfId, withId);
  if (effect.kind === "none") return <span className="shrink-0 text-right text-[12px] font-medium text-disabled">{effect.label}</span>;
  const tone = effect.kind === "lent" ? "text-credit" : "text-warning";
  return (
    <span className="flex shrink-0 flex-col items-end leading-tight">
      <span className={cn("text-[12px] font-medium", tone)}>{effect.kind === "lent" ? "you lent" : "you borrowed"}</span>
      <span className={cn("figure mt-0.5 text-sm", tone)}>{formatNpr(effect.amount)}</span>
    </span>
  );
}

/**
 * The shared tab, newest first, broken into months. Every expense says who paid and
 * what it meant for you; payments read as a sentence. Expenses open for editing.
 */
export function ExpenseFeed({
  items,
  selfId,
  withId,
  hideGroup,
  onEditExpense,
  onEditSettlement,
}: {
  items: FeedItem[];
  selfId: string;
  /** Narrow "what it meant for you" to one friend. */
  withId?: string;
  /** A group name not worth repeating on every row. */
  hideGroup?: string;
  onEditExpense: (expense: Expense) => void;
  onEditSettlement?: (settlement: Settlement) => void;
}) {
  const dates = useDateFormat();
  const months = runsBy(items, (item) => dates.monthYear(item.date));

  return (
    <div className="mt-1 flex flex-col gap-4">
      {months.map((month) => (
        <section key={month.label} aria-label={month.label}>
          <h3 className="deva pb-1 text-[13px] font-semibold text-muted-foreground">{month.label}</h3>
          <ul className="-mx-2 flex flex-col">
            {month.items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                {item.kind === "expense" ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors duration-200 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring active:bg-accent/60"
                    onClick={() => onEditExpense(item.expense)}
                  >
                    <DateChip iso={item.date} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[15px] font-semibold text-display">{item.expense.description}</span>
                        {item.expense.groupName && item.expense.groupName !== hideGroup ? (
                          <span className="hidden shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground sm:inline">{item.expense.groupName}</span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                        {who(item.expense.paidById, item.expense.paidByName, selfId)} paid <span className="figure text-foreground">{formatNpr(item.expense.amount)}</span>
                      </span>
                    </span>
                    <EffectReadout expense={item.expense} selfId={selfId} withId={withId} />
                  </button>
                ) : onEditSettlement ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors duration-200 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring active:bg-accent/60"
                    onClick={() => onEditSettlement(item.settlement)}
                  >
                    <SettlementContent settlement={item.settlement} selfId={selfId} date={dates.entry(item.date)} />
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-2 py-2">
                    <SettlementContent settlement={item.settlement} selfId={selfId} date={dates.entry(item.date)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SettlementContent({ settlement, selfId, date }: { settlement: Settlement; selfId: string; date: string }) {
  return (
    <>
      <span className="flex w-11 shrink-0 items-center justify-center self-stretch rounded-xl bg-credit/10 text-credit" aria-hidden>
        <HandCoins className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-display">
          {who(settlement.fromPersonId, settlement.fromName, selfId)} paid {who(settlement.toPersonId, settlement.toName, selfId, true)}{" "}
          <span className="figure">{formatNpr(settlement.amount)}</span>
        </span>
        <span className="deva mt-0.5 block truncate text-[13px] text-muted-foreground">
          {date} · Payment{settlement.note ? ` · ${settlement.note}` : ""}
        </span>
      </span>
    </>
  );
}
