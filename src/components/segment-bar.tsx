import { cn } from "cn";

/**
 * Rounded progress bar: pale track, solid fill.
 * Bar = proportion; always pair it with a numeric readout.
 */
export function SegmentBar({
  value,
  size = "standard",
  tone = "neutral",
  className,
}: {
  /** 0 to 1 */
  value: number;
  /** Kept for call-site compatibility. */
  segments?: number;
  size?: "hero" | "standard" | "compact";
  tone?: "neutral" | "good" | "warning" | "over";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const width = clamped === 0 ? 0 : Math.max(clamped * 100, 3);
  const fill = { neutral: "bg-brand", good: "bg-credit", warning: "bg-warning", over: "bg-negative" }[tone];
  const height = { hero: "h-3", standard: "h-2", compact: "h-1.5" }[size];
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-accent", height, className)} role="presentation" aria-hidden>
      <span className={cn("block h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${width}%` }} />
    </div>
  );
}
