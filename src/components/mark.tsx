export function Mark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-foreground" />
      <rect x="7" y="9" width="18" height="3" rx="1" className="fill-primary" />
      <rect x="7" y="15" width="13" height="3" rx="1" className="fill-primary" />
      <rect x="7" y="21" width="8" height="3" rx="1" className="fill-primary" />
    </svg>
  );
}
