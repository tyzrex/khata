import type { ReactNode } from "react";

export function Panel({ title, meta, action, children }: { title: string; meta?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-3xl bg-card shadow-card">
      <header className="flex items-center justify-between gap-3 px-6 pt-6 pb-2">
        <h2 className="text-base font-semibold tracking-[-0.02em] text-display">{title}</h2>
        <div className="flex items-center gap-3">
          {meta ? <p className="figure text-sm text-foreground">{meta}</p> : null}
          {action}
        </div>
      </header>
      <div className="px-6 pb-2">{children}</div>
    </section>
  );
}

export function sumAmounts(rows: { amount: number }[]) {
  return rows.reduce((total, row) => total + row.amount, 0);
}
