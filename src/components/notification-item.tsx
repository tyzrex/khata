"use client";

import { HandCoins, Receipt, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NotificationDto, NotificationKind } from "@/db/notifications";
import { useDateFormat } from "@/components/use-date-style";
import { formatNpr } from "@/lib/format";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "cn";

/** How each kind is drawn, and the label the row is grouped under. Badges stay neutral black-on-grey in both themes; the amount keeps the direction colour. */
const looks: Record<NotificationKind, { icon: LucideIcon; badge: string; label: string }> = {
  shared_activity: { icon: Receipt, badge: "bg-secondary text-foreground", label: "Shared activity" },
  invite: { icon: UsersRound, badge: "bg-secondary text-foreground", label: "Group" },
  balance_due: { icon: HandCoins, badge: "bg-secondary text-foreground", label: "Balance" },
};

export function notificationLook(kind: NotificationKind) {
  return looks[kind] ?? looks.shared_activity;
}

/**
 * One entry in the feed.
 *
 * Amounts are shown only for `balance_due`, where the stored number is a signed net
 * position and the colour carries the direction. A shared expense's amount is not shown:
 * the figure is the whole bill rather than anything to do with the person reading it,
 * so putting it beside their name would invite the wrong conclusion.
 */
export function NotificationRow({
  item,
  now,
  onOpen,
  className,
}: {
  item: NotificationDto;
  /** `useNow()`. Null before the browser has a clock; the row shows a date instead. */
  now: number | null;
  onOpen?: () => void;
  className?: string;
}) {
  const look = notificationLook(item.kind);
  const Icon = look.icon;
  const dates = useDateFormat();
  // A real date is always available, so the prerendered row says something useful and
  // the relative stamp refines to "3h ago" once the browser has a clock.
  const absolute = dates.entry(item.createdAt.slice(0, 10));
  const stamp = (now === null ? null : relativeTime(item.createdAt, now)) ?? absolute;
  const amount = item.kind === "balance_due" && item.amount !== null ? item.amount : null;

  return (
    <li className={cn("flex gap-3", className)}>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", look.badge)} aria-hidden>
        <Icon className="size-4" />
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 rounded-xl px-1 py-0.5 text-left outline-none transition-colors duration-200 hover:bg-secondary focus-visible:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-display">{item.title}</span>
          {!item.read ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" /> : null}
        </span>
        <span className="mt-0.5 block text-[13px] leading-5 text-muted-foreground text-pretty">{item.detail}</span>
        <span className="mt-1 flex items-center gap-2 text-[12px] text-disabled">
          <span>{look.label}</span>
          <span aria-hidden>·</span>
          <span>{stamp}</span>
          {amount !== null ? (
            <>
              <span aria-hidden>·</span>
              <span className={`figure font-semibold ${amount < 0 ? "text-warning" : "text-credit"}`}>
                {amount < 0 ? "−" : ""}
                {formatNpr(Math.abs(amount))}
              </span>
            </>
          ) : null}
        </span>
      </button>
    </li>
  );
}
