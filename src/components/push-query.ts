"use client";

import { queryOptions } from "@tanstack/react-query";
import { requestJson } from "@/lib/api-client";
import { getCurrentPushSubscription } from "@/lib/push-client";

/**
 * Push notification settings, read as one thing.
 *
 * The answer has two halves that neither side can produce alone: the browser knows whether it
 * holds a subscription, and the account knows whether that subscription is its own. A browser
 * can hold a subscription the account never recorded — a different person used this device
 * first — which is the only state where "Register this browser" should appear.
 *
 * So the query reads the local endpoint first and passes it to the route, which answers
 * `registered` against it.
 */
export const pushSettingsKey = ["push-settings"] as const;

export type PushPreferences = {
  expenseActivity: boolean;
  settlementActivity: boolean;
  showAmounts: boolean;
};

export type PushSettings = {
  configured: boolean;
  publicKey: string | null;
  preferences: PushPreferences;
  /** Khata's copy of this browser's subscription is attached to the signed-in account. */
  registered: boolean;
  /** This browser holds a local subscription at all. */
  enabled: boolean;
  permission: NotificationPermission | null;
  /** The browser cannot subscribe here (no HTTPS, no service worker, not production). */
  supported: boolean;
};

/** Shown before the server answers, and whenever a read fails — the panel must never render a half-known switch. */
export const DEFAULT_PUSH_PREFERENCES: PushPreferences = { expenseActivity: true, settlementActivity: true, showAmounts: false };

/**
 * Push only works over HTTPS against a production worker, so on localhost development and in
 * an unsupported browser this resolves without a request at all.
 */
export function pushSupported() {
  return (
    process.env.NODE_ENV === "production" &&
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export const pushSettingsQuery = queryOptions({
  queryKey: pushSettingsKey,
  queryFn: async (): Promise<PushSettings> => {
    if (!pushSupported()) {
      return { configured: false, publicKey: null, preferences: DEFAULT_PUSH_PREFERENCES, registered: false, enabled: false, permission: null, supported: false };
    }
    let endpoint: string | null = null;
    try {
      endpoint = (await getCurrentPushSubscription())?.endpoint ?? null;
    } catch {
      // No service worker yet, or the browser refused to answer: treated as "not subscribed".
      endpoint = null;
    }
    const body = await requestJson<Omit<PushSettings, "enabled" | "permission" | "supported">>(`/api/push${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ""}`);
    return { ...body, enabled: endpoint !== null, permission: Notification.permission, supported: true };
  },
  /** Only re-read on an explicit action; the card is a settings panel, not a live feed. */
  staleTime: 60_000,
});

export function patchPushPreferences(patch: Partial<PushPreferences>) {
  return requestJson<{ preferences: PushPreferences }>("/api/push/preferences", { method: "PATCH", json: patch });
}

export function postPushTest() {
  return requestJson<unknown>("/api/push/test", { method: "POST" });
}