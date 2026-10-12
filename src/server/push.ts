import webPush, { type PushSubscription as WebPushSubscription } from "web-push";
import { after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { SharedActivity } from "@/db/push-activity";
import { recordNotifications } from "@/db/notifications";
import { groupUserAccess, people } from "@/db/schema";
import { expireSnapshots } from "@/server/cache-tags";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  listPushDeliveryTargets,
  recordPushFailure,
  recordPushSuccess,
  type NotificationPreferences,
  type PushDeliveryTarget,
} from "@/db/push-notifications";

const PROVIDER_SUFFIXES = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
  "notify.windows.com",
] as const;
const STALE_STATUS_CODES = new Set([404, 410]);
const PERMANENT_STATUS_CODES = new Set([400, 401, 403]);
/**
 * How long the push service holds a message for a device it cannot reach. Android phones in
 * Doze (screen off, unplugged) only wake for queued messages in maintenance windows that can be
 * an hour or more apart, so a short TTL means the message expires before the phone ever sees it.
 */
const PUSH_TTL_SECONDS = 12 * 60 * 60;
const PUSH_TIMEOUT_MS = 10_000;

export { DEFAULT_NOTIFICATION_PREFERENCES };
export type { NotificationPreferences };
export type { SharedActivity } from "@/db/push-activity";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export type PushDeliveryResult = {
  configured: boolean;
  attempted: number;
  sent: number;
  failed: number;
  removed: number;
};

type VapidConfiguration = {
  subject: string;
  publicKey: string;
  privateKey: string;
};

function vapidConfiguration(env: Record<string, string | undefined> = process.env): VapidConfiguration | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export function getPushPublicConfiguration(env: Record<string, string | undefined> = process.env) {
  const configuration = vapidConfiguration(env);
  return {
    configured: configuration !== null,
    publicKey: configuration?.publicKey ?? null,
  };
}

export function isAllowedPushEndpoint(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const hostname = url.hostname.toLowerCase();
  return PROVIDER_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

/** A shared write's reach: who is told about it, and whose cached screens it changes. */
export type SharedWriteAudience = { notify: string[]; expire: string[] };

/**
 * Pure core of audience resolution, so the rules can be tested without a database.
 *
 * Notified: the book's owner (they are never one of their own linked contacts, so no lookup
 * finds them), plus the linked people on the expense. In a group, a participant is only told
 * if they still hold access to it: a person who left, or a linked friend who was put in the
 * member list but never invited, would otherwise be sent an amount for a book they cannot
 * open. `accessHolders` is null for a write outside any group, where there is no access list.
 * The actor is never told about their own click.
 *
 * Expired: everyone who can see the book as well, participant or not, because a member who
 * is not on this expense still sees it in the group and their cached view is now stale.
 */
export function composeAudience(input: {
  actorId: string;
  ownerId: string;
  participants: ReadonlySet<string>;
  accessHolders: ReadonlySet<string> | null;
}): SharedWriteAudience {
  const { actorId, ownerId, participants, accessHolders } = input;
  const notify = new Set<string>();
  for (const userId of participants) {
    if (!accessHolders || accessHolders.has(userId)) notify.add(userId);
  }
  notify.add(ownerId);
  notify.delete(actorId);
  const expire = new Set<string>([ownerId, ...participants, ...(accessHolders ?? []), ...notify]);
  return { notify: [...notify], expire: [...expire] };
}

/**
 * Who should hear about a shared write. Linked accounts are resolved from the owner's
 * `people` rows (the other person in a direct book, or the members of a group); groups
 * are then narrowed to `group_user_access`. `previous` is what an edit replaced: people
 * dropped from the split, or the group an expense was moved out of, still have a changed
 * balance and have to be told.
 */
export async function resolveSharedWriteAudience(input: {
  actorId: string;
  ownerId: string;
  groupId: string | null;
  personIds: string[];
  previous?: { groupId: string | null; personIds: string[] };
}): Promise<SharedWriteAudience> {
  const { actorId, ownerId, groupId, personIds, previous } = input;
  const groupIds = [...new Set([groupId, previous?.groupId].filter((value): value is string => Boolean(value)))];
  const [participants, access] = await Promise.all([
    linkedAccounts(ownerId, [...personIds, ...(previous?.personIds ?? [])]),
    Promise.all(groupIds.map((id) => groupAccessUserIds(id, ownerId))),
  ]);
  return composeAudience({
    actorId,
    ownerId,
    participants,
    accessHolders: groupIds.length ? new Set(access.flat()) : null,
  });
}

/** Who gets a feed row and a push. Kept for callers that only need that half. */
export async function resolveSharedWriteRecipients(input: {
  actorId: string;
  ownerId: string;
  groupId: string | null;
  personIds: string[];
}): Promise<string[]> {
  return (await resolveSharedWriteAudience(input)).notify;
}

/** linkedUserId for each person row the owner holds, keyed by user id. */
async function linkedAccounts(ownerId: string, personIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(personIds)];
  if (!unique.length) return new Set();
  const rows = await getDb()
    .select({ linkedUserId: people.linkedUserId })
    .from(people)
    .where(and(eq(people.userId, ownerId), inArray(people.id, unique)));
  return new Set(rows.map((row) => row.linkedUserId).filter((value): value is string => Boolean(value)));
}

/** Accounts holding access to the group: the owner and every member who accepted an invite. */
async function groupAccessUserIds(groupId: string, ownerId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ userId: groupUserAccess.userId })
    .from(groupUserAccess)
    .where(and(eq(groupUserAccess.groupId, groupId), eq(groupUserAccess.ownerUserId, ownerId)));
  return rows.map((row) => row.userId);
}

function nprAmount(amount: number) {
  return `NPR ${new Intl.NumberFormat("en-NP", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)}`;
}

export function buildPushPayload(
  activity: SharedActivity,
  preferences: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES,
): PushPayload {
  const detail = activityDetail(activity);
  return {
    title: activity.title,
    body: preferences.showAmounts ? `${detail} · ${nprAmount(activity.amount)}` : detail,
    url: activity.url,
    tag: activity.tag,
  };
}

/**
 * The sentence describing what happened, without the amount. Shared by the push body
 * and the in-app feed so both read the same way.
 */
function activityDetail(activity: SharedActivity) {
  return activity.kind === "expense"
    ? `${activity.actorName} ${activity.action} “${activity.description}”`
    : `${activity.actorName} ${activity.action} payment: ${activity.payerName} → ${activity.receiverName}`;
}

function statusCode(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return undefined;
  return typeof error.statusCode === "number" ? error.statusCode : undefined;
}

function emptyResult(configured: boolean): PushDeliveryResult {
  return { configured, attempted: 0, sent: 0, failed: 0, removed: 0 };
}

async function sendToTarget(
  target: PushDeliveryTarget,
  payload: PushPayload,
  vapidDetails: VapidConfiguration,
): Promise<Pick<PushDeliveryResult, "sent" | "failed" | "removed">> {
  const subscription: WebPushSubscription = {
    endpoint: target.endpoint,
    keys: { p256dh: target.p256dh, auth: target.auth },
  };
  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: PUSH_TTL_SECONDS,
      timeout: PUSH_TIMEOUT_MS,
      // FCM maps "high" to high priority, the only kind that wakes a dozing Android phone.
      // Every push here is shown to the person, which is what FCM requires to keep honouring it.
      urgency: "high",
      vapidDetails,
    });
    try {
      await recordPushSuccess(target.id);
    } catch {
      // Delivery succeeded; metrics persistence must not turn it into a failed financial write.
    }
    return { sent: 1, failed: 0, removed: 0 };
  } catch (error) {
    const status = statusCode(error);
    const stale = status !== undefined && STALE_STATUS_CODES.has(status);
    const failureCount = target.failureCount + 1;
    const remove = stale || (status !== undefined && PERMANENT_STATUS_CODES.has(status) ? failureCount >= 3 : failureCount >= 5);
    try {
      await recordPushFailure(target.id, remove);
    } catch {
      // A tracking failure must not expose subscription details or fail the caller.
    }
    return { sent: 0, failed: 1, removed: remove ? 1 : 0 };
  }
}

async function deliver(
  targets: PushDeliveryTarget[],
  payloadFor: (target: PushDeliveryTarget) => PushPayload,
): Promise<PushDeliveryResult> {
  const configuration = vapidConfiguration();
  if (!configuration) return emptyResult(false);
  const deliveries = await Promise.all(targets.map((target) => sendToTarget(target, payloadFor(target), configuration)));
  return deliveries.reduce<PushDeliveryResult>(
    (total, result) => ({
      ...total,
      sent: total.sent + result.sent,
      failed: total.failed + result.failed,
      removed: total.removed + result.removed,
    }),
    { ...emptyResult(true), attempted: targets.length },
  );
}

export async function sendSharedActivityPush(userIds: string[], activity: SharedActivity): Promise<PushDeliveryResult> {
  if (!vapidConfiguration()) return emptyResult(false);
  const targets = (await listPushDeliveryTargets(userIds)).filter((target) =>
    activity.kind === "expense" ? target.preferences.expenseActivity : target.preferences.settlementActivity,
  );
  return deliver(targets, (target) => buildPushPayload(activity, target.preferences));
}

export async function sendTestPush(userId: string): Promise<PushDeliveryResult> {
  if (!vapidConfiguration()) return emptyResult(false);
  const targets = await listPushDeliveryTargets([userId]);
  return deliver(targets, () => ({
    title: "Khata notifications are ready",
    body: "You’ll receive shared expense and settlement activity here.",
    url: "/",
    tag: "khata-test",
  }));
}

/**
 * Fan out a shared write to every linked account except the actor. Fire-and-forget
 * from routes: the financial write already committed, so a push failure must never
 * surface as an expense or settlement error. `sendSharedActivityPush` applies each
 * person's preferences and privacy choice.
 *
 * The in-app feed row is written first and unconditionally. `sendSharedActivityPush`
 * returns early when the VAPID keys are absent, so gating the insert on delivery
 * would leave the feed permanently empty on deployments without them. Amounts are
 * always included here: `showAmounts` governs what a lock screen shows, not what the
 * signed-in owner sees on their own dashboard.
 */
export function notifySharedWrite(input: {
  actorId: string;
  ownerId: string;
  groupId: string | null;
  personIds: string[];
  activity: SharedActivity;
  /** What an edit replaced (see `resolveSharedWriteAudience`). Absent for creates and deletes. */
  previous?: { groupId: string | null; personIds: string[] };
  /**
   * Notify the actor as well. Off by default: someone who taps "save" already saw
   * it happen, and a feed entry for their own click is noise. On for writes made
   * with an API key, where the actor is a bot acting on their behalf and they
   * would otherwise never find out.
   */
  includeActor?: boolean;
}) {
  const { actorId, ownerId, groupId, personIds, activity, previous, includeActor = false } = input;
  const run = async () => {
    try {
      const audience = await resolveSharedWriteAudience({ actorId, ownerId, groupId, personIds, previous });
      const recipients = audience.notify;
      if (includeActor && !recipients.includes(actorId)) recipients.push(actorId);
      // Everyone standing in this book just had their balances move, so every one
      // of their cached snapshots is now wrong — not just the account that made
      // the call and had its own snapshot expired by `defineRoute`, and not just the
      // people named on the expense: a member who is not on it still sees it listed.
      expireSnapshots([...audience.expire, ...recipients]);
      if (!recipients.length) return;
      await recordNotifications(
        recipients.map((userId) => ({
          userId,
          kind: "shared_activity" as const,
          title: activity.title,
          detail: activityDetail(activity),
          url: activity.url,
          amount: activity.amount,
          // Keyed on the action as well as the record, so a create, an edit, and a
          // delete each land. Repeated edits of the same expense collapse into one
          // entry on purpose: five "Asha edited this" rows help nobody.
          eventKey: `shared:${activity.tag}:${activity.action}`,
        })),
      );
      await sendSharedActivityPush(recipients, activity);
    } catch (error) {
      console.error("Shared push fan-out failed", error);
    }
  };
  // `after` keeps the delivery inside the request lifecycle on the server without
  // delaying the response; elsewhere this is a plain background task.
  try {
    after(run);
  } catch {
    void run();
  }
}
