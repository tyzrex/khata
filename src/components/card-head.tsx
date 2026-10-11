/** A card's title line, with an optional hint beneath and an optional action on the right. */
export function CardHead({ title, hint, action, onAction }: { title: string; hint?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] leading-5 font-semibold tracking-[-0.015em] text-display">{title}</h2>
        {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {action && onAction ? (
        <button
          type="button"
          className="-mt-1 -mr-3 shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium text-interactive transition-colors duration-200 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onAction}
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}
