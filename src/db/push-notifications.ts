import { and, count, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notificationPreferences, pushSubscriptions } from "@/db/schema";

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  expenseActivity: true,
  settlementActivity: true,
  showAmounts: false,
} as const;

export type NotificationPreferences = {
  expenseActivity: boolean;
  settlementActivity: boolean;
  showAmounts: boolean;
};

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushDeliveryTarget = PushSubscriptionInput & {
  id: string;
  userId: string;
  failureCount: number;
  preferences: NotificationPreferences;
};

export class PushSubscriptionLimitError extends Error {
  constructor() {
    super("Remove an old notification subscription before adding another device.");
    this.name = "PushSubscriptionLimitError";
  }
}

function preferencesFromRow(row: {
  expenseActivity: boolean | null;
  settlementActivity: boolean | null;
  showAmounts: boolean | null;
}): NotificationPreferences {
  return {
    expenseActivity: row.expenseActivity ?? DEFAULT_NOTIFICATION_PREFERENCES.expenseActivity,
    settlementActivity: row.settlementActivity ?? DEFAULT_NOTIFICATION_PREFERENCES.settlementActivity,
    showAmounts: row.showAmounts ?? DEFAULT_NOTIFICATION_PREFERENCES.showAmounts,
  };
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const [row] = await getDb()
    .select({
      expenseActivity: notificationPreferences.expenseActivity,
      settlementActivity: notificationPreferences.settlementActivity,
      showAmounts: notificationPreferences.showAmounts,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return row ? preferencesFromRow(row) : { ...DEFAULT_NOTIFICATION_PREFERENCES };
}

export async function updateNotificationPreferences(
  userId: string,
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const now = new Date();
  const [row] = await getDb()
    .insert(notificationPreferences)
    .values({ userId, ...DEFAULT_NOTIFICATION_PREFERENCES, ...patch, updatedAt: now })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { ...patch, updatedAt: now },
    })
    .returning({
      expenseActivity: notificationPreferences.expenseActivity,
      settlementActivity: notificationPreferences.settlementActivity,
      showAmounts: notificationPreferences.showAmounts,
    });
  return preferencesFromRow(row);
}

export async function upsertPushSubscription(userId: string, input: PushSubscriptionInput) {
  const now = new Date();
  await getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, input.endpoint))
      .limit(1);

    if (!existing) {
      const [total] = await tx
        .select({ value: count() })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));
      if ((total?.value ?? 0) >= 10) throw new PushSubscriptionLimitError();
    }

    await tx
      .insert(pushSubscriptions)
      .values({
        id: existing?.id ?? crypto.randomUUID(),
        userId,
        ...input,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId,
          p256dh: input.p256dh,
          auth: input.auth,
          updatedAt: now,
          lastSuccessAt: null,
          failureCount: 0,
        },
      });
  });
}

export async function deletePushSubscription(userId: string, endpoint: string) {
  await getDb()
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

/**
 * Whether this account still owns the browser subscription for an endpoint.
 * A browser can hold a subscription that the account has never recorded (first
 * visit after another account used this device, or a row swept as stale), so
 * the client needs to tell "subscribed here" apart from "subscribed nowhere".
 */
export async function hasPushSubscription(userId: string, endpoint: string) {
  const [row] = await getDb()
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .limit(1);
  return row !== undefined;
}

export async function listPushDeliveryTargets(userIds: string[]): Promise<PushDeliveryTarget[]> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return [];
  const rows = await getDb()
    .select({
      id: pushSubscriptions.id,
      userId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      failureCount: pushSubscriptions.failureCount,
      expenseActivity: notificationPreferences.expenseActivity,
      settlementActivity: notificationPreferences.settlementActivity,
      showAmounts: notificationPreferences.showAmounts,
    })
    .from(pushSubscriptions)
    .leftJoin(notificationPreferences, eq(notificationPreferences.userId, pushSubscriptions.userId))
    .where(inArray(pushSubscriptions.userId, unique));
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    failureCount: row.failureCount,
    preferences: preferencesFromRow(row),
  }));
}

export async function recordPushSuccess(id: string) {
  await getDb()
    .update(pushSubscriptions)
    .set({ lastSuccessAt: new Date(), failureCount: 0 })
    .where(eq(pushSubscriptions.id, id));
}

export async function recordPushFailure(id: string, remove: boolean) {
  if (remove) {
    await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
    return;
  }
  await getDb()
    .update(pushSubscriptions)
    .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
    .where(eq(pushSubscriptions.id, id));
}
