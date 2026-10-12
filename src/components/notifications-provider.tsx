"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { ledgerKeys } from "@/components/ledger-query";
import {
  notificationsKey,
  notificationsQuery,
  postMarkRead,
  type FeedResponse,
  type MarkReadInput,
} from "@/components/notifications-query";
import { sharesKey } from "@/components/shares-query";
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
 * Freshness comes from plain polling (see `notifications-query.ts`). A new feed row
 * means a shared write happened somewhere, and that moves balances too — so when
 * the poll returns ids this tab has not seen before, the share book and ledger go
 * along with it. That is what stops an open tab from sitting on numbers that
 * stopped being true, without any stream or socket.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isPending, refetch } = useQuery(notificationsQuery);

  // Ids this tab has already accounted for. New ones mean a shared write landed
  // elsewhere, so the balances alongside the bell need a re-read too.
  const seenIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data) return;
    const current = new Set(data.notifications.map((item) => item.id));
    if (seenIds.current) {
      let fresh = false;
      for (const id of current) {
        if (!seenIds.current.has(id)) {
          fresh = true;
          break;
        }
      }
      if (fresh) {
        // One shared write behind the new rows; loop because a single
        // `queryKey` can only name one resource.
        void queryClient.invalidateQueries({ queryKey: sharesKey });
        for (const key of ledgerKeys) void queryClient.invalidateQueries({ queryKey: key });
      }
    }
    seenIds.current = current;
  }, [data, queryClient]);

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
