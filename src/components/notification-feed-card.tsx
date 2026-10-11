"use client";

import { useRouter } from "next/navigation";
import { CardHead } from "@/components/card-head";
import { NotificationRow } from "@/components/notification-item";
import { useNotifications } from "@/components/notifications-provider";
import { useNow } from "@/components/use-now";
import { Button } from "@/components/ui/button";

/**
 * The notification feed on the dashboard.
 *
 * Shows the same query as the bell rather than a second read, so the dashboard and the
 * badge are always describing the same feed. Deliberately capped at a handful of
 * entries: this is a glanceable summary, and the bell panel is where you read the rest.
 */
export function NotificationFeedCard({ limit = 5 }: { limit?: number }) {
  const router = useRouter();
  const { items, unread, loading, markRead, markAllRead } = useNotifications();
  const now = useNow();
  const visible = items.slice(0, limit);

  function handleOpen(id: string, url: string | null) {
    markRead(id);
    if (url) router.push(url);
  }

  return (
    <section className="rounded-3xl bg-card p-4 shadow-card sm:p-5 2xl:p-6">
      <CardHead
        title="Notifications"
        hint={unread > 0 ? `${unread} unread` : "Shared activity, invites, and open balances"}
        action={unread > 0 ? "Mark read" : undefined}
        onAction={markAllRead}
      />
      {loading && visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading notifications…</p>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <p className="max-w-xs text-sm text-muted-foreground">
            Nothing yet. When someone adds a shared expense, invites you to a group, or a balance stays open, it shows up here.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => router.push("/activity")}>
            See shared activity
          </Button>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {visible.map((item) => (
            <NotificationRow key={item.id} item={item} now={now} className="py-2.5" onOpen={() => handleOpen(item.id, item.url)} />
          ))}
        </ul>
      )}
    </section>
  );
}
