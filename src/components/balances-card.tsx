import { cn } from "cn";
import type { ReactNode } from "react";

/** Shared surface for the balances, activity and settings screens: same scale as the dashboard cards. */
export function Card({
  title,
  hint,
  aside,
  children,
  className,
}: {
  title: string;
  hint?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-3xl bg-card p-4 shadow-card sm:p-5 2xl:p-6", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] leading-5 font-semibold tracking-[-0.015em] text-display">{title}</h2>
          {hint ? <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p> : null}
        </div>
        {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
      </header>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Initials in a circle. Tone carries direction: owed to you, you owe, or neutral. */
export function PersonMark({ name, tone = "neutral", className }: { name: string; tone?: "owed" | "owe" | "neutral" | "brand"; className?: string }) {
  const look = {
    owed: "bg-credit/12 text-credit",
    owe: "bg-warning/12 text-warning",
    neutral: "bg-secondary text-foreground",
    brand: "bg-accent text-accent-foreground",
  }[tone];
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold", look, className)} aria-hidden>
      {initials(name)}
    </span>
  );
}

/** Quiet empty line inside a card, with an optional action. */
export function CardEmpty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-secondary/60 px-4 py-8 text-center">
      <p className="max-w-xs text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}
