"use client";

const DEVELOPMENT_MESSAGE = "Push notifications are unavailable in development because the Khata service worker is disabled. Use a production build over HTTPS.";
const UNSUPPORTED_MESSAGE = "This browser does not support web push notifications.";
const OPERATION_TIMEOUT_MS = 10_000;

type SerializedPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
};

function assertPushEnvironment() {
  if (typeof window === "undefined") throw new Error("Push notifications are only available in a browser.");
  if (process.env.NODE_ENV !== "production") throw new Error(DEVELOPMENT_MESSAGE);
  if (!window.isSecureContext) throw new Error("Push notifications require a secure HTTPS connection.");
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error(UNSUPPORTED_MESSAGE);
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isKhataRegistration(registration: ServiceWorkerRegistration) {
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (!worker) return false;
  const script = new URL(worker.scriptURL);
  return script.origin === window.location.origin && script.pathname === "/sw.js";
}

async function existingRegistration() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration && isKhataRegistration(registration) ? registration : null;
}

async function pushRegistration() {
  assertPushEnvironment();
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  const ready = registration.active
    ? registration
    : await withTimeout(navigator.serviceWorker.ready, OPERATION_TIMEOUT_MS, "The notification service worker did not become ready. Reload and try again.");
  if (!isKhataRegistration(ready)) throw new Error("The active service worker is not Khata's /sw.js. Close other Khata tabs, reload, and try again.");
  return ready;
}

async function apiError(response: Response, fallback: string) {
  try {
    const value = (await response.json()) as { error?: unknown };
    return typeof value.error === "string" && value.error ? value.error : fallback;
  } catch {
    return fallback;
  }
}

function serializeSubscription(subscription: PushSubscription): SerializedPushSubscription {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new Error("The browser did not provide valid push encryption keys. Disable notifications in browser settings, then try again.");
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime,
    keys: { p256dh, auth },
  };
}

async function postSubscription(subscription: PushSubscription) {
  const response = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serializeSubscription(subscription)),
  });
  if (!response.ok) throw new Error(await apiError(response, "Khata could not register this browser for notifications."));
}

/** Convert a URL-safe base64 VAPID key into the byte array expected by PushManager. */
function vapidPublicKeyBytes(value: string) {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  let decoded: string;
  try {
    decoded = window.atob(padded);
  } catch {
    throw new Error("Khata's notification public key is invalid. Please try again later.");
  }
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

/** Register (or reuse) Khata's production worker and return this browser's subscription. */
export async function getCurrentPushSubscription() {
  const registration = await pushRegistration();
  return registration.pushManager.getSubscription();
}

/** Associate an existing local subscription with the currently signed-in account. */
export async function claimPushSubscription(subscription: PushSubscription) {
  assertPushEnvironment();
  await postSubscription(subscription);
}

/** Request permission from an explicit user action, subscribe locally, then register with Khata. */
export async function enablePushNotifications(publicKey: string) {
  assertPushEnvironment();
  if (!publicKey) throw new Error("Khata's notification service is not configured yet.");

  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted. You can change it in your browser or device settings.");

  const registration = await pushRegistration();
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidPublicKeyBytes(publicKey),
    }));

  try {
    await postSubscription(subscription);
  } catch (error) {
    await withTimeout(subscription.unsubscribe(), 2_000, "Local notification cleanup timed out.").catch(() => undefined);
    throw error;
  }
  return subscription;
}

/** Remove this browser from the account first, then remove its local subscription. */
export async function disableCurrentBrowserPush() {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;

  const response = await fetch("/api/push", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!response.ok) throw new Error(await apiError(response, "Khata could not disable notifications for this browser."));

  const removed = await withTimeout(subscription.unsubscribe(), 2_000, "The browser took too long to disable notifications.");
  if (!removed) throw new Error("Khata removed this browser from your account, but the browser could not clear its local subscription. Check its notification settings.");
}

/** Clear the local browser subscription without calling an API (used after account deletion). */
export async function unsubscribePushLocally() {
  assertPushEnvironment();
  const registration = await existingRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await withTimeout(subscription.unsubscribe(), 2_000, "Local notification cleanup timed out.");
}

/** Best-effort privacy cleanup while the authenticated session still exists. */
export async function detachPushBeforeSignOut() {
  try {
    assertPushEnvironment();
    const registration = await withTimeout(existingRegistration(), 750, "Notification lookup timed out.");
    const subscription = await withTimeout(Promise.resolve(registration?.pushManager.getSubscription() ?? null), 750, "Notification lookup timed out.");
    if (!subscription) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1_500);
    try {
      await fetch("/api/push", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
        signal: controller.signal,
      });
    } catch {
      // Sign-out must continue; the service worker also unsubscribes as a local privacy fallback.
    } finally {
      window.clearTimeout(timer);
      await withTimeout(subscription.unsubscribe(), 1_000, "Local notification cleanup timed out.").catch(() => undefined);
    }
  } catch {
    // Push cleanup must never trap the user in a signed-in session.
  }
}
