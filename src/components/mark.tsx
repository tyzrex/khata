/** Khata mark: a filled disc with three ledger lines, drawn in the brand blue. */
export function Mark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="16" className="fill-brand" />
      <rect x="8" y="10" width="16" height="2" rx="1" className="fill-brand-foreground" />
      <rect x="8" y="15" width="11" height="2" rx="1" className="fill-brand-foreground" />
      <rect x="8" y="20" width="6" height="2" rx="1" className="fill-brand-foreground" />
    </svg>
  );
}
