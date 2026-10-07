import type { CategorySlice, DaySpend } from "@/lib/types";
import { formatNpr } from "@/lib/format";

export function CategoryDonut({ slices, total }: { slices: CategorySlice[]; total: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const painted = slices.filter((slice) => slice.amount > 0);

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 120 120" className="size-36 shrink-0" aria-hidden>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--border)" strokeWidth="12" />
        {total > 0
          ? painted.map((slice) => {
              const length = (slice.amount / total) * circumference;
              const dash = `${length} ${circumference - length}`;
              const circle = (
                <circle
                  key={slice.category}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth="12"
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                  transform="rotate(-90 60 60)"
                >
                  <title>{`${slice.category} ${formatNpr(slice.amount)}`}</title>
                </circle>
              );
              offset += length;
              return circle;
            })
          : null}
        <text x="60" y="58" textAnchor="middle" className="fill-foreground" style={{ fontSize: 11, fontFamily: "var(--font-outfit), sans-serif" }}>
          Spent
        </text>
        <text x="60" y="74" textAnchor="middle" className="fill-foreground" style={{ fontSize: 13, fontFamily: "var(--font-fraunces), serif" }}>
          {total > 0 ? formatNpr(total).replace("NPR ", "") : "—"}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {painted.length === 0 ? (
          <li className="text-sm text-muted-foreground">No expenses in this period.</li>
        ) : (
          painted.map((slice) => {
            const width = total > 0 ? Math.max(8, (slice.amount / painted[0]!.amount) * 100) : 0;
            return (
              <li key={slice.category}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{slice.category}</span>
                  <span className="figure text-foreground">{formatNpr(slice.amount)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
                  <div className="h-full rounded-full" style={{ width: `${width}%`, background: slice.color }} />
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

export function WeekSparkline({ days }: { days: DaySpend[] }) {
  const width = 320;
  const height = 88;
  const max = Math.max(...days.map((day) => day.spent), 1);
  const points = days.map((day, index) => {
    const x = days.length === 1 ? width / 2 : (index / (days.length - 1)) * width;
    const y = height - 8 - (day.spent / max) * (height - 20);
    return { ...day, x, y };
  });
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full" aria-hidden>
        <path d={area} fill="var(--primary)" opacity="0.16" />
        <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point) => (
          <circle key={point.date} cx={point.x} cy={point.y} r={point.spent > 0 ? 3.5 : 2} fill={point.spent > 0 ? "var(--primary)" : "var(--border)"} />
        ))}
      </svg>
      <ol className="mt-2 grid grid-cols-7 gap-1">
        {points.map((point) => (
          <li key={point.date} className="text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{point.label}</p>
            <p className="figure mt-1 text-[11px] text-foreground">{point.spent ? point.spent.toLocaleString("en-IN") : "·"}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
