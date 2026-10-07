export function Mark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" className="fill-foreground" />
      <rect x="7" y="9" width="18" height="2.5" rx="1" className="fill-background" />
      <rect x="7" y="15" width="13" height="2.5" rx="1" className="fill-background" />
      <rect x="7" y="21" width="8" height="2.5" rx="1" className="fill-background" />
    </svg>
  );
}
