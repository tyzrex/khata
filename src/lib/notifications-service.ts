import "server-only";

import { after } from "next/server";
import {
  FEED_PAGE_SIZE,
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  maybePruneNotifications,
  type NotificationDto,
} from "@/db/notifications";
import { syncBalanceDueNotifications } from "@/lib/balance-due";

/**
 * The notification feed, as the API layer needs it.
 *
 * Route handlers stay thin: they authenticate, validate, and serialise. Everything
 * about how a feed is assembled or reconciled lives here, so the shape of the response
 * and the rules that keep it honest are defined once rather than per handler.
 */

export type FeedPage = {
  notifications: NotificationDto[];
  unread: number;
};

export type MarkReadInput = { ids?: string[]; all?: boolean };

/**
 * Read a page of the feed plus the count that drives the bell badge.
 *
 * The two maintenance passes run through `after` so neither delays nor fails a read:
 * reconciling the standing balance reminder against the share book is the expensive one,
 * and pruning read entries past the retention window is pure housekeeping. A balance
 * that changed since the previous read therefore appears on the next poll rather than
 * adding a share-book query to every feed load.
 */
export async function getFeed(userId: string, options: { limit?: number; before?: string } = {}): Promise<FeedPage> {
  const { limit = FEED_PAGE_SIZE, before } = options;
  const [notifications, unread] = await Promise.all([listNotifications(userId, limit, before), countUnreadNotifications(userId)]);

  const maintenance = async () => {
    await maybePruneNotifications();
    await syncBalanceDueNotifications(userId);
  };
  try {
    after(maintenance);
  } catch {
    void maintenance().catch((error) => console.error("Notification maintenance failed", error));
  }

  return { notifications, unread };
}

/** Mark entries read and report the count that remains, so the client needs no second read. */
export async function markFeedRead(userId: string, input: MarkReadInput): Promise<{ unread: number }> {
  if (input.all) await markAllNotificationsRead(userId);
  else await markNotificationsRead(userId, input.ids ?? []);
  return { unread: await countUnreadNotifications(userId) };
}
