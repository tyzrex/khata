"use client";

import { queryOptions } from "@tanstack/react-query";
import { requestJson } from "@/lib/api-client";
import type { NotificationDto } from "@/db/notifications";

/**
 * The feed's cache contract: one place that owns the query key, so the bell in the
 * shell and the card on the dashboard can never drift onto separate caches.
 */

export const notificationsKey = ["notifications"] as const;

export type FeedResponse = {
  notifications: NotificationDto[];
  unread: number;
};

export type MarkReadInput = { ids?: string[]; all?: boolean };

export const notificationsQuery = queryOptions({
  queryKey: notificationsKey,
  queryFn: () => requestJson<FeedResponse>("/api/notifications"),
  /**
   * The bell is a background signal, not a live view. A long interval keeps it from
   * polling a page somebody is only glancing at, while `refetchOnWindowFocus` (on by
   * default) covers the case that actually matters: a shared write landing while the
   * app sat open in another tab.
   */
  staleTime: 60_000,
  refetchInterval: 60_000,
  // Never poll a hidden tab. The browser already throttles timers there, and a
  // background poll would keep the connection open on a phone that is just asleep.
  refetchIntervalInBackground: false,
});

/** Returns the count that remains unread, so the client needs no follow-up read. */
export function postMarkRead(input: MarkReadInput) {
  return requestJson<{ unread: number }>("/api/notifications", { method: "PATCH", json: input });
}
