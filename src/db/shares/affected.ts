import { expireSnapshots } from "@/server/cache-tags";

/**
 * Expire the cached screens of accounts a structural change just altered.
 *
 * `defineRoute` already expires the caller's own snapshot. A group deleted, a member
 * removed or a friend disconnected also changes what *other* accounts see, and none of
 * them called the endpoint, so the write has to say who they are. Call this after the
 * transaction commits.
 *
 * Expiry is a courtesy to the next page load, never a reason to fail a write that already
 * committed, and `revalidateTag` throws outside a request (scripts, tests), so it is swallowed.
 */
export function expireAffected(userIds: Iterable<string | null | undefined>) {
  const ids = [...new Set([...userIds].filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  try {
    expireSnapshots(ids);
  } catch {
    // Not inside a request: there is no cache to expire.
  }
}
