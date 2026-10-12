import { and, desc, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notifications } from "@/db/schema";
import { publishFeedEvent } from "@/server/notification-stream";

/**
 * What produced a feed entry. Stored as free text so adding a kind does not need a
 * migration, but it is checked on read: one unrecognised row must not break the feed.
 */
export const NOTIFICATION_KINDS = ["shared_activity", "invite", "balance_due"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const KINDS = new Set<string>(NOTIFICATION_KINDS);
function kindOf(value: string): NotificationKind {
  return KINDS.has(value) ? (value as NotificationKind) : "shared_activity";
}

export type NotificationDto = {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  url: string | null;
  amount: number | null;
  read: boolean;
  createdAt: string;
};

export type NotificationInput = {
  userId: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  url?: string | null;
  amount?: number | null;
  /**
   * Identifies the event within this user's feed. Two fan-outs for the same event
   * produce the same key, so a retry cannot double-post.
   */
  eventKey: string;
};

export const FEED_PAGE_SIZE = 20;

/** Read entries age out; unread ones are kept so a person who steps away loses nothing. */
export const RETENTION_DAYS = 90;

export function dedupeKeyFor(userId: string, eventKey: string) {
  return `${userId}:${eventKey}`;
}

/**
 * Write feed entries, skipping any whose event was already recorded. Returns the ids
 * actually inserted, so callers can tell a fresh event from an already-seen one.
 * Delivery is best effort by design: a failure here must never surface as an expense
 * or settlement error, so callers pass this inside their own guarded block.
 */
export async function recordNotifications(inputs: NotificationInput[]): Promise<string[]> {
  if (!inputs.length) return [];
  const now = new Date();
  const rows = await getDb()
    .insert(notifications)
    .values(
      inputs.map((input) => ({
        id: crypto.randomUUID(),
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        detail: input.detail,
        url: input.url ?? null,
        amount: input.amount ?? null,
        dedupeKey: dedupeKeyFor(input.userId, input.eventKey),
        createdAt: now,
      })),
    )
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  announce(inputs, rows.length > 0);
  return rows.map((row) => row.id);
}

/**
 * Tell anything watching a feed that it just moved.
 *
 * Called from the one function that means "a feed entry now exists", so no write
 * path has to remember to announce itself. Fire-and-forget and unawaited: the row
 * is already committed, and a stream that misses the event still gets the entry
 * from its next poll.
 *
 * The conflict check matters — a retried fan-out inserts nothing, and announcing
 * that would have every open tab refetch to find an identical feed.
 */
function announce(inputs: NotificationInput[], inserted: boolean) {
  if (!inserted) return;
  const shared = inputs.some((input) => input.kind === "shared_activity");
  for (const userId of new Set(inputs.map((input) => input.userId))) void publishFeedEvent({ userId, kind: "created", activity: shared });
}

/**
 * Newest first. `before` pages backwards using the id of the last row already seen.
 *
 * The cursor compares on `(createdAt, id)` rather than the timestamp alone. Every row
 * written by one fan-out shares a single `createdAt`, so a group of siblings landing
 * together spans the page boundary — comparing only the timestamp would step straight
 * over the rest of that group and silently lose entries.
 */
export async function listNotifications(userId: string, limit = FEED_PAGE_SIZE, before?: string): Promise<NotificationDto[]> {
  const db = getDb();
  const [anchor] = before
    ? await db
        .select({ createdAt: notifications.createdAt, id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.id, before)))
        .limit(1)
    : [];

  const filters = [eq(notifications.userId, userId)];
  if (anchor) filters.push(or(lt(notifications.createdAt, anchor.createdAt), and(eq(notifications.createdAt, anchor.createdAt), lt(notifications.id, anchor.id)))!);

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...filters))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(Math.min(Math.max(limit, 1), 50));

  return rows.map((row) => ({
    id: row.id,
    kind: kindOf(row.kind),
    title: row.title,
    detail: row.detail,
    url: row.url,
    amount: row.amount,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ value: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`));
  return row?.value ?? 0;
}

/** Mark specific entries read. Unknown ids are ignored rather than rejected. */
export async function markNotificationsRead(userId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), inArray(notifications.id, ids), sql`${notifications.readAt} is null`))
    .returning({ id: notifications.id });
  return rows.length;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const rows = await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`))
    .returning({ id: notifications.id });
  return rows.length;
}

/**
 * Retire the previous unread entries of one kind, keeping a single current one.
 *
 * Used for `balance_due`, which is a standing condition rather than an event: when
 * the set of open balances changes, the older reminder describes a situation that no
 * longer holds, so it is marked read instead of being left to sit in the badge. The
 * rows stay in history.
 */
export async function retireOtherNotificationsOfKind(userId: string, kind: NotificationKind, keepId: string): Promise<number> {
  const rows = await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.kind, kind), sql`${notifications.id} <> ${keepId}`, sql`${notifications.readAt} is null`))
    .returning({ id: notifications.id });
  return rows.length;
}

/** Drop read entries past the retention window. Unread rows are never touched. */
export async function pruneNotifications(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const rows = await getDb()
    .delete(notifications)
    .where(and(lt(notifications.createdAt, cutoff), isNotNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length;
}

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastPrunedAt = 0;

/**
 * Run the prune at most once an hour per server instance.
 *
 * There is no scheduler in this project, so maintenance rides along with a read that
 * is happening anyway. The module-scoped timestamp matches the in-memory limiter
 * windows in `request-guard`: it resets on a cold start, which is exactly the
 * behaviour a roughly-hourly sweep can tolerate.
 */
export async function maybePruneNotifications(): Promise<void> {
  const now = Date.now();
  if (now - lastPrunedAt < PRUNE_INTERVAL_MS) return;
  lastPrunedAt = now;
  try {
    await pruneNotifications();
  } catch (error) {
    // Retention is housekeeping. Never let it surface as a failed feed read.
    console.error("Notification prune failed", error);
  }
}
