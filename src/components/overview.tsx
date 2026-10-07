"use client";

import { useState } from "react";
import { CategoryDonut, WeekSparkline } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { formatNpr, formatRange } from "@/lib/format";
import type { SummaryResponse } from "@/lib/types";

export function Overview({
  summary,
  onAdd,
  onSample,
}: {
  summary: SummaryResponse;
  onAdd: () => void;
  onSample: () => Promise<void>;
}) {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [sampling, setSampling] = useState(false);
  const current = summary[period];

  async function loadSample() {
    setSampling(true);
    try {
      await onSample();
    } finally {
      setSampling(false);
    }
  }

  if (summary.totalCount === 0) {
    return (
      <section className="rise mx-auto max-w-xl py-10 md:py-16">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">First page</p>
        <h1 className="figure mt-3 text-4xl leading-tight md:text-5xl">The book is blank.</h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
          Khata keeps rupees in Postgres, so the same ledger opens on your phone and your laptop. Load the sample week
          from 6–7 October — cinema, parking, chiya, a NIMB credit, and a Nepal Life commission — or write the first
          line yourself.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button type="button" className="h-11 px-4" disabled={sampling} onClick={() => void loadSample()}>
            {sampling ? "Loading sample" : "Load sample week"}
          </Button>
          <Button type="button" variant="outline" className="h-11 px-4" onClick={onAdd}>
            Add an entry
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="rise space-y-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{formatRange(current.start, current.end)}</p>
          <h1 className="figure mt-2 text-4xl md:text-5xl">{period === "week" ? "This week" : "This month"}</h1>
        </div>
        <div className="flex gap-4 text-sm">
          {(["week", "month"] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={key === period ? "border-b-2 border-primary pb-1 text-foreground" : "pb-1 text-muted-foreground"}
              onClick={() => setPeriod(key)}
            >
              {key === "week" ? "This week" : "This month"}
            </button>
          ))}
        </div>
      </header>

      <section className="grid gap-8 border-y border-border py-6 sm:grid-cols-3 sm:gap-0">
        <div className="sm:pr-8">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Spent</p>
          <p className="figure mt-2 text-4xl md:text-[2.75rem]">{formatNpr(current.spent)}</p>
          <span className="mt-3 block h-0.5 w-10 bg-primary" />
          <p className="mt-3 text-sm text-muted-foreground">{current.expenseCount} expenses</p>
        </div>
        <div className="sm:border-l sm:px-8">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Credits</p>
          <p className="figure mt-2 text-4xl text-credit md:text-[2.75rem]">{formatNpr(current.credits)}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Income {formatNpr(current.income)}
            <span className="px-1.5 text-border">·</span>
            Transfers {formatNpr(current.transfers)}
          </p>
        </div>
        <div className="sm:border-l sm:pl-8">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Net</p>
          <p className="figure mt-2 text-4xl md:text-[2.75rem]">{formatNpr(current.net)}</p>
          <p className="mt-3 text-sm text-muted-foreground">Credits minus spend</p>
        </div>
      </section>

      <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <h2 className="text-sm font-medium">Where it went</h2>
          <p className="mt-1 text-sm text-muted-foreground">Expense categories for this {period}.</p>
          <div className="mt-5">
            <CategoryDonut slices={current.byCategory} total={current.spent} />
          </div>
        </div>
        <div>
          <h2 className="text-sm font-medium">This week, day by day</h2>
          <p className="mt-1 text-sm text-muted-foreground">Expenses only, Monday through Sunday. Asia/Kathmandu.</p>
          <div className="mt-4">
            <WeekSparkline days={summary.week.daily} />
          </div>
        </div>
      </section>
    </div>
  );
}
