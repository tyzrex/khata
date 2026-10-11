/**
 * Past this, a relative stamp stops being more useful than the date itself. Feed entries
 * are retained for 90 days and unread ones indefinitely, so "4mo ago" is a real case.
 */
const RELATIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * "3h ago", or null when the entry is older than the relative window or the stamp is
 * unusable — the caller then falls back to a real date.
 *
 * `now` is a parameter rather than read from the clock so this stays pure and testable.
 * Callers must not call `Date.now()` during render: `cacheComponents` prerenders client
 * components, and reading the clock there is a build error. Pass a value obtained after
 * mount instead (see `useMounted`).
 */
export function relativeTime(iso: string, now: number): string | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const elapsed = now - then;
  // A clock skewed behind the server's can put an entry in the future; say nothing
  // rather than rendering a negative age.
  if (elapsed < 0 || elapsed > RELATIVE_WINDOW_MS) return null;
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
