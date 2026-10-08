import { cn } from "cn"

/** Quiet loading state: a spinning ring and a label. */
export function Loading({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <p role="status" className={cn("label flex items-center gap-3 py-16", className)}>
      <span className="size-4 animate-spin rounded-full border-2 border-input border-t-brand" aria-hidden />
      {label}
    </p>
  )
}
