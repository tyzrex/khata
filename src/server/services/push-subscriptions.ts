import {
  deletePushSubscription,
  getNotificationPreferences,
  hasPushSubscription,
  PushSubscriptionLimitError,
  updateNotificationPreferences,
  upsertPushSubscription,
  type NotificationPreferences,
  type PushSubscriptionInput,
} from "@/db/push-notifications";
import { getPushPublicConfiguration, isAllowedPushEndpoint } from "@/server/push";
import { sendTestPush } from "@/server/push";
import { NotFoundError, RequestError, ValidationError } from "@/server/errors";

/**
 * Notification wiring for one account.
 *
 * The interesting work is refusing things: an endpoint that is not from a real
 * push service must never be stored (it would be followed on every send), and a
 * tenth device must not silently evict somebody's phone. Both are domain rules,
 * so both live here rather than in a route handler.
 */

export type SubscriptionDraft = { endpoint: string; expirationTime?: number | null; keys?: { p256dh: string; auth: string } };

export type NotificationRegistration = {
  configured: boolean;
  publicKey: string | null;
  preferences: NotificationPreferences;
  registered: boolean;
};

/**
 * GET takes the browser's endpoint so it can also answer `registered`: the
 * browser may hold a local subscription the account has never recorded, which is
 * the one state neither the browser nor the account knows about alone.
 */
export async function readRegistration(userId: string, endpoint: string): Promise<NotificationRegistration> {
  const { configured, publicKey } = getPushPublicConfiguration();
  return {
    configured,
    publicKey,
    preferences: await getNotificationPreferences(userId),
    registered: endpoint ? await hasPushSubscription(userId, endpoint) : false,
  };
}

/** Claims a browser for this account. The endpoint moves between accounts on sign-in. */
export async function registerSubscription(userId: string, input: SubscriptionDraft) {
  if (!isAllowedPushEndpoint(input.endpoint)) throw new ValidationError("That push endpoint is not from a supported push service.");
  if (!input.keys) throw new ValidationError("That subscription is missing its keys.");
  try {
    await upsertPushSubscription(userId, { endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth });
  } catch (error) {
    if (error instanceof PushSubscriptionLimitError) throw new ValidationError(error.message);
    throw error;
  }
}

export function removeSubscription(userId: string, endpoint: string) {
  return deletePushSubscription(userId, endpoint);
}

export function savePreferences(userId: string, preferences: Partial<NotificationPreferences>) {
  return updateNotificationPreferences(userId, preferences);
}

/** Everything the account needs to know why a test notification did or did not arrive. */
export async function runTestNotification(userId: string) {
  const result = await sendTestPush(userId);
  if (!result.configured) throw new RequestError("Khata's notification service is not configured yet.", 503);
  if (!result.attempted) throw new NotFoundError("This browser is not registered for notifications yet. Enable them first.");
  return { sent: result.sent };
}

export type { NotificationPreferences, PushSubscriptionInput };