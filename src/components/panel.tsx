import type { ReactNode } from "react";

export function Panel({ title, meta, action, children }: { title: string; meta?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium">{title}</h2>
        <div className="flex items-center gap-3">
          {meta ? <p className="figure text-sm text-muted-foreground">{meta}</p> : null}
          {action}
        </div>
      </header>
      <div className="px-4">{children}</div>
    </section>
  );
}

export function sumAmounts(rows: { amount: number }[]) {
  return rows.reduce((total, row) => total + row.amount, 0);
}
