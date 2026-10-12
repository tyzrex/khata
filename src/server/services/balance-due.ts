import { recordNotifications, retireOtherNotificationsOfKind } from "@/db/notifications";
import { getShareBook } from "@/db/shares";
import { describeOpenBalances } from "@/lib/balance-summary";

/**
 * Reconciling reads the whole share book, which is the most expensive query in the app.
 * The feed polls every minute, so running it on every poll would double the database work
 * of a session that simply has the tab open. An open balance is a slow-moving fact, so
 * checking a few times an hour is enough for it to appear promptly after a change.
 */
const MIN_INTERVAL_MS = 5 * 60_000;
let lastCheckedAt = 0;

/**
 * Reconcile the standing balance reminder against the share book as it stands.
 *
 * This runs off the read path, which is a deliberate trade. The repo has no scheduler,
 * so there is no cron to hang a sweep on, and a balance that is already open should
 * surface the next time somebody looks rather than at some arbitrary moment. The insert
 * is idempotent (see `describeOpenBalances`), so being called often costs one indexed
 * conflict rather than a duplicate row.
 */
export async function syncBalanceDueNotifications(userId: string): Promise<string | null> {
  const now = Date.now();
  if (now - lastCheckedAt < MIN_INTERVAL_MS) return null;
  lastCheckedAt = now;

  const book = await getShareBook(userId);
  const open = describeOpenBalances({ overall: book.overall, groups: book.joinedGroups.map((group) => group.balances) });

  // Nothing outstanding. Any entry already in the feed stays as history; it is simply no
  // longer current, and its fingerprint will not match again if the balance returns.
  if (!open) return null;

  const created = await recordNotifications([
    {
      userId,
      kind: "balance_due",
      title: open.title,
      detail: open.detail,
      url: "/balances",
      amount: open.amount,
      eventKey: `balance:${open.fingerprint}`,
    },
  ]);
  const current = created[0];
  if (!current) return null;

  // The older reminder described a set of debts that no longer holds. Mark it read so
  // it stops counting towards the badge, but leave the row as history.
  await retireOtherNotificationsOfKind(userId, "balance_due", current);
  return current;
}
