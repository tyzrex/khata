/**
 * Small trend line with a soft wash under it and a dot on the latest value.
 * Scales to its box; the y-range pads 10% so a flat line sits mid-height instead of on the floor.
 * The end dot is ringed in the brand colour: it is drawn for the brand card.
 */
export function Sparkline({ values, className, stroke = "currentColor", id }: { values: number[]; className?: string; stroke?: string; id: string }) {
  if (values.length < 2) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = (high - low) * 0.1 || Math.abs(high) * 0.1 || 1;
  const min = low - pad;
  const span = high + pad - min;
  const x = (index: number) => (index / (values.length - 1)) * 100;
  const y = (value: number) => 100 - ((value - min) / span) * 100;
  const line = values.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ");
  const last = values.at(-1)!;

  return (
    <div className={`relative ${className ?? ""}`} aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L 100 100 L 0 100 Z`} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-brand" style={{ left: "100%", top: `${y(last)}%` }} />
    </div>
  );
}
