"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NotificationRow } from "@/components/notification-item";
import { useNotifications } from "@/components/notifications-provider";
import { useNow } from "@/components/use-now";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";

/**
 * The unread-count bell.
 *
 * Mounted twice — once in the desktop sidebar footer, once in the mobile topbar — but
 * both read the same query through the provider, so the two badges can never disagree.
 * That is also why this holds no state of its own beyond whether the panel is open.
 *
 * Presentation is passed in rather than decided here: the two call sites already size
 * their own controls differently, and duplicating those decisions would only let the
 * bell drift from the buttons sitting next to it.
 */
export function NotificationsBell({
  className,
  variant = "outline",
  size = "icon-sm",
  align = "end",
  side = "top",
}: {
  className?: string;
  variant?: "ghost" | "outline";
  size?: "icon" | "icon-sm";
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
}) {
  const router = useRouter();
  const { items, unread, loading, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const now = useNow();

  function handleOpen(id: string, url: string | null) {
    markRead(id);
    setOpen(false);
    if (url) router.push(url);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant={variant}
            size={size}
            className={cn("relative", className)}
            title="Notifications"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          >
            <Bell />
            {unread > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[11px] leading-[18px] font-bold text-brand-foreground ring-2 ring-card">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align={align} side={side} className="w-[min(22rem,calc(100vw-2rem))] p-2">
        <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-2">
          <p className="text-[15px] font-semibold text-display">Notifications</p>
          {unread > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-interactive transition-colors duration-200 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CheckCheck className="size-3.5" aria-hidden />
              Mark all read
            </button>
          ) : null}
        </div>
        {loading && items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing yet. Shared expenses, group invites, and open balances show up here.</p>
        ) : (
          <ul className="max-h-[22rem] divide-y divide-border overflow-y-auto">
            {items.map((item) => (
              <NotificationRow key={item.id} item={item} now={now} className="px-1 py-2.5" onOpen={() => handleOpen(item.id, item.url)} />
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
