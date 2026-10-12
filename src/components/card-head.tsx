/** A card's title line, with an optional hint beneath and an optional action on the right. */
export function CardHead({ title, hint, action, onAction }: { title: string; hint?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base leading-6 font-semibold tracking-[-0.015em] text-display">{title}</h2>
        {hint ? <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{hint}</p> : null}
      </div>
      {action && onAction ? (
        <button
          type="button"
          className="-mt-1 -mr-2 flex min-h-10 shrink-0 items-center rounded-xl px-3 text-sm font-medium text-interactive transition-colors duration-200 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onAction}
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}
