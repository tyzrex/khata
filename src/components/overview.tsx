"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatNpr, formatRange } from "@/lib/format";
import type { SummaryResponse } from "@/lib/types";

export function Overview({
  summary,
  owe,
  owed,
  onAdd,
  onSample,
  onBalances,
}: {
  summary: SummaryResponse;
  owe: number | null;
  owed: number | null;
  onAdd: () => void;
  onSample: () => Promise<void>;
  onBalances: () => void;
}) {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [sampling, setSampling] = useState(false);
  const current = summary[period];

  if (summary.totalCount === 0) {
    return (
      <section className="mx-auto flex max-w-lg flex-col gap-4 py-16">
        <h1 className="text-lg font-medium tracking-tight">The ledger is empty</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Load the sample week — cinema, parking, chiya, a NIMB credit, and a Nepal Life commission — or write the first line yourself.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            disabled={sampling}
            onClick={() => {
              setSampling(true);
              void onSample().finally(() => setSampling(false));
            }}
          >
            {sampling ? "Loading sample" : "Load sample week"}
          </Button>
          <Button type="button" variant="outline" onClick={onAdd}>
            Add an entry
          </Button>
        </div>
      </section>
    );
  }

  const maxCategory = current.byCategory[0]?.amount ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{formatRange(current.start, current.end)}</p>
          <h1 className="text-lg font-medium tracking-tight">{period === "week" ? "This week" : "This month"}</h1>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {(["week", "month"] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={key === period ? "rounded-md bg-foreground px-3 py-1 text-sm text-background" : "rounded-md px-3 py-1 text-sm text-muted-foreground"}
              onClick={() => setPeriod(key)}
            >
              {key === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
      </div>

      <section className="grid overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3">
        <div className="border-b border-border px-4 py-4 sm:border-r sm:border-b-0">
          <p className="text-xs text-muted-foreground">Spent</p>
          <p className="figure mt-2 text-2xl">{formatNpr(current.spent)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{current.expenseCount} expenses</p>
        </div>
        <div className="border-b border-border px-4 py-4 sm:border-r sm:border-b-0">
          <p className="text-xs text-muted-foreground">Credits</p>
          <p className="figure mt-2 text-2xl text-credit">{formatNpr(current.credits)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Income {formatNpr(current.income)} · Transfers {formatNpr(current.transfers)}
          </p>
        </div>
        <div className="px-4 py-4">
          <p className="text-xs text-muted-foreground">Net</p>
          <p className="figure mt-2 text-2xl">{formatNpr(current.net)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Credits minus spend</p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="rounded-lg border border-border bg-card px-4 py-4">
          <h2 className="text-sm font-medium">Spending</h2>
          {current.byCategory.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No expenses in this period.</p>
          ) : (
            <ul className="mt-3 flex flex-col">
              {current.byCategory.map((slice) => (
                <li key={slice.category} className="grid grid-cols-[7rem_minmax(0,1fr)_5.5rem] items-center gap-3 py-2">
                  <span className="truncate text-sm">{slice.category}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-foreground/80"
                      style={{ width: `${maxCategory ? (slice.amount / maxCategory) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="figure text-right text-sm">{formatNpr(slice.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 grid grid-cols-7 gap-2 border-t border-border pt-4">
            {summary.week.daily.map((day) => (
              <div key={day.date} className="text-center">
                <p className="text-[10px] tracking-wide text-muted-foreground uppercase">{day.label}</p>
                <p className="figure mt-1 text-xs">{day.spent ? formatNpr(day.spent).replace("NPR ", "") : "—"}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">With people</h2>
            <Button type="button" variant="ghost" size="sm" onClick={onBalances}>
              Balances
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border px-3 py-3">
              <p className="text-xs text-muted-foreground">You owe</p>
              <p className="figure mt-2 text-xl">{owe == null ? "—" : formatNpr(owe)}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-3">
              <p className="text-xs text-muted-foreground">You are owed</p>
              <p className="figure mt-2 text-xl text-credit">{owed == null ? "—" : formatNpr(owed)}</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Friend balances are separate from Nabil and NIMB. A settlement can point at a bank credit without changing that line&apos;s amount.
          </p>
        </section>
      </div>
    </div>
  );
}
