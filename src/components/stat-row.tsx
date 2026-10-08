import type { ReactNode } from "react";
import { cn } from "cn";

/** Label left (muted), value right. Color goes on the value only. */
export function StatRow({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-6 border-b border-border py-4 last:border-b-0", className)}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <p className="figure shrink-0 text-lg text-display">{children}</p>
    </div>
  );
}
