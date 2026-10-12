import { revalidateTag } from "next/cache";

/**
 * Cache tags for the data a signed-in screen is rendered from.
 *
 * The snapshot the layout streams in is a `use cache` scope keyed by account, so
 * anything that writes to a ledger or a share book has to be able to expire it.
 * That is the whole contract between this file and the write paths: a write that
 * forgets to expire is a write whose result the next person to open the app will
 * not see, which is why `defineRoute` expires it on the caller's behalf rather
 * than leaving it to each route to remember.
 *
 * Tags and cache keys are stored in plain text, so they carry the account id and
 * nothing else — never a name, an email, or an amount.
 */

/** The one tag the signed-in snapshot is cached under. */
export function snapshotTag(userId: string) {
  return `khata:snapshot:${userId}`;
}

/**
 * Drop a user's snapshot so the next read waits for the database.
 *
 * `{ expire: 0 }` rather than the `"max"` stale-while-revalidate profile on
 * purpose. This is called from Route Handlers, which cannot use `updateTag`,
 * and the person who just wrote is the one who has to see it land — serving them
 * the numbers from before their own save is the one outcome that is always wrong.
 */
export function expireSnapshot(userId: string) {
  if (!userId) return;
  revalidateTag(snapshotTag(userId), { expire: 0 });
}

/**
 * Expire several accounts at once, ignoring repeats.
 *
 * A shared write changes the book of everyone standing in it, not just the person
 * who made it, so their snapshots are stale too even though none of them called
 * this endpoint.
 */
export function expireSnapshots(userIds: Iterable<string>) {
  for (const userId of new Set(userIds)) expireSnapshot(userId);
}