"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { formatNpr } from "@/lib/format";
import type { Bucket } from "@/lib/dashboard";

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

/** Widest a column may grow; the rest of its slot stays air. */
const MAX_BAR = 22;
const TICK_COUNT = 4;

type Mode = "daily" | "pace";

/** Round step (1, 2, 2.5 or 5 × 10ⁿ) that splits the peak into about four clean ticks. */
function niceScale(peak: number) {
  if (peak <= 0) return { max: 1000, step: 250 };
  const raw = peak / TICK_COUNT;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? 10 * magnitude;
  return { max: Math.ceil(peak / step) * step, step };
}

function running(values: number[]) {
  return values.reduce<number[]>((acc, value, index) => [...acc, (index === 0 ? 0 : acc[index - 1]!) + value], []);
}

/**
 * Spend over the period, two ways.
 * Daily: one column per bucket, money in as an optional paired column, a dashed rule at the average.
 * Pace: spend so far against the same point of the period before, so a glance says ahead or behind.
 */
export function CashFlowChart({
  buckets,
  previous,
  today,
  average,
  compareLabel,
  height = 208,
}: {
  buckets: Bucket[];
  /** The period before, bucket for bucket. Enables the pace view. */
  previous?: Bucket[];
  /** ISO date; buckets after it have not happened yet. */
  today?: string;
  /** Average spend per bucket, drawn as a reference rule. */
  average?: number;
  /** "last month", "last week"… */
  compareLabel?: string;
  height?: number;
}) {
  const [mode, setMode] = useState<Mode>("daily");
  const [showIn, setShowIn] = useState(false);
  const canPace = previous != null && previous.length > 0;
  const view = canPace ? mode : "daily";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {canPace ? (
          <div className="flex h-11 items-center rounded-xl bg-secondary p-0.5" role="group" aria-label="Chart view">
            {(["daily", "pace"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={view === item}
                onClick={() => setMode(item)}
                className={
                  view === item
                    ? "h-full rounded-md bg-card px-3 text-sm font-semibold text-display shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    : "h-full rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-display focus-visible:ring-2 focus-visible:ring-ring"
                }
              >
                {item === "daily" ? "Daily" : "Pace"}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}

        {view === "daily" ? (
          <div className="flex items-center gap-1.5">
            <Key swatch={SOLID_KEY}>Spent</Key>
            <button
              type="button"
              aria-pressed={showIn}
              onClick={() => setShowIn((value) => !value)}
              className={
                showIn
                  ? "flex h-10 items-center gap-2 rounded-xl bg-secondary px-3 text-sm font-medium text-display outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  : "flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground ring-1 ring-border transition-colors outline-none ring-inset hover:bg-secondary hover:text-display focus-visible:ring-2 focus-visible:ring-ring"
              }
            >
              <span className={showIn ? "size-2 rounded-[3px] bg-chart-soft" : "size-2 rounded-[3px] bg-chart-soft opacity-50"} aria-hidden /> Money in
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Key swatch={SOLID_KEY}>This period</Key>
            <Key swatch={DASHED_KEY}>{compareLabel ? `${compareLabel[0]!.toUpperCase()}${compareLabel.slice(1)}` : "Before"}</Key>
          </div>
        )}
      </div>

      {view === "daily" ? (
        <DailyColumns buckets={buckets} today={today} average={average} showIn={showIn} height={height} />
      ) : (
        <PaceLines buckets={buckets} previous={previous!} today={today} compareLabel={compareLabel ?? "before"} height={height} />
      )}
    </div>
  );
}

const SOLID_KEY = <span className="size-2 rounded-[3px] bg-brand" aria-hidden />;
const DASHED_KEY = <span className="w-3 border-t-2 border-dashed border-muted-foreground" aria-hidden />;

function Key({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span className="flex h-10 items-center gap-2 rounded-xl bg-secondary px-3 text-sm font-medium text-display">
      {swatch} {children}
    </span>
  );
}

/** Y ticks on the left, gridlines across, x labels under; the plot goes in children. */
function Frame({
  ticks,
  max,
  buckets,
  active,
  height,
  onLeave,
  children,
}: {
  ticks: number[];
  max: number;
  buckets: Bucket[];
  active: number | null;
  height: number;
  onLeave: () => void;
  children: ReactNode;
}) {
  const count = buckets.length;
  const labelEvery = Math.max(1, Math.ceil(count / 10));
  const top = (value: number) => `${100 - (value / max) * 100}%`;
  return (
    <div className="flex gap-3">
      <div className="relative w-9 shrink-0" style={{ height }} aria-hidden>
        {ticks.map((tick) => (
          <span key={tick} className="absolute right-0 -translate-y-1/2 text-[12px] leading-none font-medium text-disabled tabular-nums" style={{ top: top(tick) }}>
            {compact.format(tick)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }} onPointerLeave={onLeave}>
          {ticks.map((tick) => (
            <span key={tick} className={tick === 0 ? "absolute inset-x-0 border-t border-input" : "absolute inset-x-0 border-t border-border"} style={{ top: top(tick) }} aria-hidden />
          ))}
          {children}
        </div>
        <div className="mt-2.5 grid text-center text-[12px] font-medium text-disabled tabular-nums" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }} aria-hidden>
          {buckets.map((bucket, index) => (
            <span key={bucket.key} className={index === active ? "font-semibold text-display" : undefined}>
              {index % labelEvery === 0 || index === active ? bucket.label : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Dark tooltip beside the hovered slot. It measures itself against the plot: right of the slot when it fits,
 * left when it does not, and clamped inside the plot when neither side has room (narrow phones).
 */
function Tip({ center, anchor, children }: { center: number; anchor: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Positioned imperatively before paint: the fit depends on the tooltip's own rendered width.
  useLayoutEffect(() => {
    const tip = ref.current;
    const plot = tip?.parentElement;
    if (!tip || !plot) return;
    const width = tip.offsetWidth;
    const span = plot.clientWidth;
    tip.style.maxWidth = `${span}px`;
    const at = (center / 100) * span;
    const right = at + MAX_BAR;
    const leftSide = at - MAX_BAR - width;
    const left = right + width <= span ? right : leftSide >= 0 ? leftSide : Math.min(Math.max(at - width / 2, 0), Math.max(span - width, 0));
    tip.style.left = `${left}px`;
  });
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute z-10 max-w-full break-words rounded-xl bg-display px-3 py-2 text-[13px] text-background shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]"
      style={{ left: `${center}%`, top: `clamp(0px, calc(${100 - anchor}% - 24px), calc(100% - 72px))` }}
    >
      {children}
    </div>
  );
}

/** Invisible full-height hit slots: hover, tap or focus one to read it. */
function Slots({ buckets, label, onPick, children }: { buckets: Bucket[]; label: (bucket: Bucket, index: number) => string; onPick: (index: number | null) => void; children?: (bucket: Bucket, index: number) => ReactNode }) {
  return (
    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}>
      {buckets.map((bucket, index) => (
        <button
          key={bucket.key}
          type="button"
          className="group/slot relative flex h-full items-end justify-center gap-[2px] px-[18%] outline-none @container"
          aria-label={label(bucket, index)}
          onPointerEnter={() => onPick(index)}
          onFocus={() => onPick(index)}
          onBlur={() => onPick(null)}
          onClick={() => onPick(index)}
        >
          {children?.(bucket, index)}
        </button>
      ))}
    </div>
  );
}

function DailyColumns({ buckets, today, average, showIn, height }: { buckets: Bucket[]; today?: string; average?: number; showIn: boolean; height: number }) {
  const [picked, setPicked] = useState<number | null>(null);
  const count = buckets.length;
  const peakIndex = buckets.reduce((best, bucket, index) => (bucket.spent > (buckets[best]?.spent ?? -1) ? index : best), 0);
  const active = picked ?? peakIndex;
  const current = buckets[active];

  const peak = Math.max(...buckets.map((bucket) => Math.max(bucket.spent, showIn ? bucket.credits : 0)), average ?? 0, 0);
  const { max, step } = niceScale(peak);
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, index) => max - index * step);
  const pct = (value: number) => (value / max) * 100;
  const center = ((active + 0.5) / count) * 100;

  return (
    <Frame ticks={ticks} max={max} buckets={buckets} active={picked} height={height} onLeave={() => setPicked(null)}>
      <Slots buckets={buckets} label={(bucket) => `${bucket.full}: spent ${formatNpr(bucket.spent)}${showIn ? `, in ${formatNpr(bucket.credits)}` : ""}`} onPick={setPicked}>
        {(bucket, index) => {
          const future = today != null && bucket.key > today;
          const lit = picked == null || picked === index;
          return (
            <>
              <span className={index === picked ? "absolute inset-x-[8%] inset-y-0 rounded-lg bg-secondary" : "absolute inset-x-[8%] inset-y-0 rounded-lg"} aria-hidden />
              <Column value={pct(bucket.spent)} className={future ? "bg-input" : lit ? "bg-brand" : "bg-brand/35"} />
              {showIn ? <Column value={pct(bucket.credits)} className={lit ? "bg-chart-soft" : "bg-chart-soft/40"} paired /> : null}
            </>
          );
        }}
      </Slots>

      {average != null && average > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-display/40" style={{ top: `${100 - pct(average)}%` }} aria-hidden>
          <span className="absolute right-0 -translate-y-full rounded-md bg-card/90 px-1.5 pb-0.5 text-[11px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
            Avg {compact.format(Math.round(average))}
          </span>
        </div>
      ) : null}

      {current ? (
        <Tip center={center} anchor={Math.min(Math.max(pct(current.spent), showIn ? pct(current.credits) : 0), 100)}>
          <span className="deva block font-medium opacity-70">{current.full}</span>
          <span className="mt-1 flex items-center gap-1.5 font-semibold tabular-nums">
            <span className="size-2 rounded-[3px] bg-brand ring-1 ring-background/40" aria-hidden />
            Spent {formatNpr(current.spent)}
          </span>
          {showIn ? (
            <span className="mt-0.5 flex items-center gap-1.5 font-semibold tabular-nums">
              <span className="size-2 rounded-[3px] bg-chart-soft" aria-hidden />
              In {formatNpr(current.credits)}
            </span>
          ) : null}
        </Tip>
      ) : null}
    </Frame>
  );
}

function PaceLines({ buckets, previous, today, compareLabel, height }: { buckets: Bucket[]; previous: Bucket[]; today?: string; compareLabel: string; height: number }) {
  const [picked, setPicked] = useState<number | null>(null);
  const count = buckets.length;
  const lived = buckets.filter((bucket) => today == null || bucket.key <= today).length;
  const now = running(buckets.slice(0, Math.max(lived, 1)).map((bucket) => bucket.spent));
  const before = running(previous.slice(0, count).map((bucket) => bucket.spent));
  const { max, step } = niceScale(Math.max(...now, ...before, 0));
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, index) => max - index * step);
  const pct = (value: number) => (value / max) * 100;
  const x = (index: number) => ((index + 0.5) / count) * 100;
  const path = (values: number[]) => values.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${100 - pct(value)}`).join(" ");
  const nowLine = path(now);
  const nowArea = now.length > 1 ? `${nowLine} L ${x(now.length - 1)} 100 L ${x(0)} 100 Z` : "";

  const active = picked ?? now.length - 1;
  const atNow = now[Math.min(active, now.length - 1)];
  const atBefore = before[Math.min(active, before.length - 1)];
  const hasNow = active < now.length;
  const diff = hasNow && atNow != null && atBefore != null ? atNow - atBefore : null;
  const anchor = Math.max(hasNow && atNow != null ? pct(atNow) : 0, atBefore != null ? pct(atBefore) : 0);

  return (
    <Frame ticks={ticks} max={max} buckets={buckets} active={picked} height={height} onLeave={() => setPicked(null)}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="pace-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-tint)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--brand-tint)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={path(before)} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity="0.7" />
        <path d={nowArea} fill="url(#pace-fill)" />
        <path d={nowLine} fill="none" stroke="var(--brand-tint)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>

      <span className="pointer-events-none absolute inset-y-0 border-l border-border" style={{ left: `${x(active)}%` }} aria-hidden />
      {atBefore != null ? <Dot left={x(active)} top={100 - pct(atBefore)} className="bg-muted-foreground" /> : null}
      {hasNow && atNow != null ? <Dot left={x(active)} top={100 - pct(atNow)} className="bg-brand-tint" /> : null}

      <Slots
        buckets={buckets}
        onPick={setPicked}
        label={(bucket, index) => `${bucket.full}: ${index < now.length ? `${formatNpr(now[index]!)} spent so far` : "not yet"}, ${formatNpr(before[Math.min(index, before.length - 1)] ?? 0)} by this point ${compareLabel}`}
      />

      {buckets[active] ? (
        <Tip center={x(active)} anchor={anchor}>
          <span className="deva block font-medium opacity-70">{buckets[active]!.full}</span>
          {hasNow && atNow != null ? <span className="mt-1 block font-semibold tabular-nums">So far {formatNpr(atNow)}</span> : <span className="mt-1 block font-semibold">Not here yet</span>}
          {atBefore != null ? <span className="mt-0.5 block tabular-nums opacity-70">{`${compareLabel[0]!.toUpperCase()}${compareLabel.slice(1)}`} {formatNpr(atBefore)}</span> : null}
          {diff != null && Math.abs(diff) >= 1 ? (
            <span className={`mt-1.5 block border-t border-background/15 pt-1.5 font-semibold tabular-nums ${diff > 0 ? "text-negative" : "text-credit"}`}>
              {formatNpr(Math.abs(diff))} {diff > 0 ? "ahead of" : "behind"} {compareLabel}
            </span>
          ) : null}
        </Tip>
      ) : null}
    </Frame>
  );
}

/** Marker with a surface ring so it stays legible where it crosses a line. */
function Dot({ left, top, className }: { left: number; top: number; className: string }) {
  return <span className={`pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card ${className}`} style={{ left: `${left}%`, top: `${top}%` }} aria-hidden />;
}

/** One column: rounded top, square foot, capped width. A paired column hides when its slot is under 14px. */
function Column({ value, className, paired = false }: { value: number; className: string; paired?: boolean }) {
  return (
    <span
      className={`relative block min-w-[3px] flex-1 rounded-t-[4px] transition-colors duration-200 ${paired ? "hidden @min-[14px]:block" : ""} ${className}`}
      style={{ height: value > 0 ? `max(${value}%, 2px)` : 0, maxWidth: MAX_BAR }}
      aria-hidden
    />
  );
}
