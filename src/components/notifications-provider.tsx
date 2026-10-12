"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { ledgerKeys } from "@/components/ledger-query";
import {
  LIVE_POLL_MS,
  notificationsKey,
  notificationsQuery,
  postMarkRead,
  type FeedResponse,
  type MarkReadInput,
} from "@/components/notifications-query";
import { sharesKey } from "@/components/shares-query";
import { useFeedStream } from "@/components/use-feed-stream";
import type { NotificationDto } from "@/db/notifications";

export type NotificationsValue = {
  items: NotificationDto[];
  unread: number;
  loading: boolean;
  /** Called when a feed entry is opened, so it stops counting towards the badge. */
  markRead: (id: string) => void;
  markAllRead: () => void;
  refresh: () => void;
};

const NotificationsContext = createContext<NotificationsValue | null>(null);

export function useNotifications() {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("useNotifications must be used inside NotificationsProvider");
  return value;
}

/**
 * The signed-in notification feed, shared by the bell in the shell and the card on the
 * dashboard so the two can never disagree about what is unread.
 *
 * Fetching, refetching on focus, and retry policy all belong to the query; this
 * only adapts it to a context. Marking read is optimistic: the badge clears on click and
 * rolls back if the write fails, so a person is never left looking at a badge that the
 * server disagrees with.
 *
 * Live updates arrive over the server-sent stream rather than by waiting for the poll.
 * A shared expense moves more than the feed — it changes the balances of everyone in
 * the book — so a signal that names a shared write refetches those too, which is what
 * stops an open tab from sitting on numbers that stopped being true.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const onSignal = useCallback(
    ({ activity }: { activity: boolean }) => {
      const keys: readonly (readonly unknown[])[] = activity ? [notificationsKey, sharesKey, ...ledgerKeys] : [notificationsKey];
      void queryClient.invalidateQueries({ queryKey: keys });
    },
    [queryClient],
  );
  const live = useFeedStream(onSignal);

  // The stream is the fast path; the poll is what guarantees eventual consistency
  // when it is not connected. While it is, the poll is only a safety net and can
  // step well back so an open tab is not re-reading the feed every minute.
  const { data, isPending, refetch } = useQuery({ ...notificationsQuery, refetchInterval: live ? LIVE_POLL_MS : notificationsQuery.refetchInterval });

  const mark = useMutation({
    mutationFn: postMarkRead,
    onMutate: async (input: MarkReadInput) => {
      // Stop any in-flight poll from overwriting the optimistic value mid-update.
      await queryClient.cancelQueries({ queryKey: notificationsKey });
      const previous = queryClient.getQueryData<FeedResponse>(notificationsKey);
      queryClient.setQueryData<FeedResponse>(notificationsKey, (current) => {
        if (!current) return current;
        const targets = new Set(input.all ? current.notifications.map((item) => item.id) : (input.ids ?? []));
        const notifications = current.notifications.map((item) => (item.read || !targets.has(item.id) ? item : { ...item, read: true }));
        // The server counts unread across the whole feed, not just this page, so step
        // the total down by what actually changed rather than recounting the page.
        const cleared = current.notifications.filter((item) => !item.read && targets.has(item.id)).length;
        return { notifications, unread: Math.max(0, current.unread - cleared) };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(notificationsKey, context.previous);
    },
    onSuccess: (result) => {
      // The read flags we set are correct; the count is the server's to confirm.
      queryClient.setQueryData<FeedResponse>(notificationsKey, (current) => (current ? { ...current, unread: result.unread } : current));
    },
  });

  const markRead = useCallback(
    (id: string) => {
      // Opening something already read must not decrement the badge, which is
      // counting something else entirely.
      const target = data?.notifications.find((item) => item.id === id);
      if (!target || target.read) return;
      mark.mutate({ ids: [id] });
    },
    [data, mark],
  );

  const markAllRead = useCallback(() => {
    if (!data?.unread) return;
    mark.mutate({ all: true });
  }, [data, mark]);

  const value = useMemo<NotificationsValue>(
    () => ({ items: data?.notifications ?? [], unread: data?.unread ?? 0, loading: isPending, markRead, markAllRead, refresh: () => void refetch() }),
    [data, isPending, markRead, markAllRead, refetch],
  );

  return <NotificationsContext value={value}>{children}</NotificationsContext>;
}
