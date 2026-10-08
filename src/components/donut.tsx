import type { ReactNode } from "react";

export type DonutSlice = { name: string; value: number; color: string };

/** Surface-coloured gap between slices, in pixels of arc. */
const GAP = 2.5;

/**
 * Ring chart. Each slice is a stroke segment; the centre takes any content.
 * Pass `active` to lift one slice and fade the rest, and `onActive` to make slices hoverable.
 */
export function Donut({
  slices,
  size = 176,
  thickness = 22,
  active = null,
  onActive,
  children,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  active?: string | null;
  onActive?: (name: string | null) => void;
  children?: ReactNode;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = (size - thickness) / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const gap = slices.length > 1 ? GAP : 0;
  const starts = slices.reduce<number[]>((acc, slice, index) => [...acc, index === 0 ? 0 : acc[index - 1]! + (slices[index - 1]!.value / total) * circumference], []);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} onPointerLeave={() => onActive?.(null)}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90 overflow-visible" role="img" aria-label="Spending by category">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--secondary)" strokeWidth={thickness} />
        {total > 0
          ? slices.map((slice, index) => {
              const length = (slice.value / total) * circumference;
              const dash = Math.max(length - gap, 0.5);
              const lit = active == null || active === slice.name;
              return (
                <circle
                  key={slice.name}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={active === slice.name ? thickness + 6 : thickness}
                  strokeLinecap="butt"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-starts[index]!}
                  className="transition-[opacity,stroke-width] duration-200"
                  style={{ opacity: lit ? 1 : 0.28, cursor: onActive ? "pointer" : undefined }}
                  onPointerEnter={onActive ? () => onActive(slice.name) : undefined}
                />
              );
            })
          : null}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">{children}</div>
    </div>
  );
}
