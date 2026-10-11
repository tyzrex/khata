"use client";

import type { ReactNode } from "react";
import { cn } from "cn";
import { formatNpr } from "@/lib/format";

/** Shared pieces for the Friends and Groups books: cards, avatars and balance readouts. */

/** Below this a balance counts as settled; amounts are rounded to paisa. */
const SETTLED = 0.005;

function initials(name: string) {
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

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm leading-6 text-pretty text-muted-foreground">{children}</p>;
}
