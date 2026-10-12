import webPush, { type PushSubscription as WebPushSubscription } from "web-push";
import { after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { SharedActivity } from "@/db/push-activity";
import { recordNotifications } from "@/db/notifications";
import { groupMembers, groupUserAccess, people } from "@/db/schema";
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

/**
 * Who should hear about a shared write. The owner always knows (they wrote it),
 * so resolve everyone else with a linked Khata account: the other members of a
 * group write via `group_user_access`, or the other person in a direct book via
 * their linked `people` row. Unknown or unlinked people resolve to nobody.
 */
export async function resolveSharedWriteRecipients(input: {
  actorId: string;
  ownerId: string;
  groupId: string | null;
  personIds: string[];
}): Promise<string[]> {
  const { actorId, ownerId, groupId, personIds } = input;
  const linked = await linkedAccounts(ownerId, personIds);
  const recipients = new Set<string>();

  if (groupId) {
    const [members, access] = await Promise.all([groupMemberUserIds(groupId, ownerId), groupAccessUserIds(groupId, ownerId)]);
    for (const userId of [...members, ...access]) {
      if (userId !== actorId && linked.has(userId)) recipients.add(userId);
    }
    return [...recipients];
  }

  for (const userId of linked.values()) {
    if (userId !== actorId) recipients.add(userId);
  }
  return [...recipients];
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

/** Linked accounts reachable through group membership rows. */
async function groupMemberUserIds(groupId: string, ownerId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ linkedUserId: people.linkedUserId })
    .from(groupMembers)
    .innerJoin(people, and(eq(people.id, groupMembers.personId), eq(people.userId, ownerId)))
    .where(eq(groupMembers.groupId, groupId));
  return rows.map((row) => row.linkedUserId).filter((value): value is string => Boolean(value));
}

/** Linked accounts with direct access to the group (invite-accepted members). */
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
  /**
   * Notify the actor as well. Off by default: someone who taps "save" already saw
   * it happen, and a feed entry for their own click is noise. On for writes made
   * with an API key, where the actor is a bot acting on their behalf and they
   * would otherwise never find out.
   */
  includeActor?: boolean;
}) {
  const { actorId, ownerId, groupId, personIds, activity, includeActor = false } = input;
  const run = async () => {
    try {
      const recipients = await resolveSharedWriteRecipients({ actorId, ownerId, groupId, personIds });
      if (includeActor && !recipients.includes(actorId)) recipients.push(actorId);
      if (!recipients.length) return;
      // Everyone standing in this book just had their balances move, so every one
      // of their cached snapshots is now wrong — not just the account that made
      // the call and had its own snapshot expired by `defineRoute`.
      expireSnapshots(recipients);
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
