/// <reference lib="webworker" />
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { CacheableResponsePlugin, CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/*
 * Privacy rule for this worker: nothing that can carry a user's data is ever written to a cache.
 * Pages, RSC payloads and every /api/ route are network-only, so a shared phone never shows the
 * previous account's ledger, and sign-out leaves nothing private behind. Only build assets that
 * are identical for every user (hashed JS/CSS, fonts, icons, the offline shell) are cached.
 */

const VERSION = "v2";
const STATIC_CACHE = `khata-static-${VERSION}`;
const ICON_CACHE = `khata-icons-${VERSION}`;
const MANIFEST_CACHE = `khata-manifest-${VERSION}`;
const KEEP = new Set([STATIC_CACHE, ICON_CACHE, MANIFEST_CACHE]);

const isRsc = (request: Request) => request.headers.get("RSC") === "1";

const runtimeCaching: RuntimeCaching[] = [
  // Auth and data: always the network, never stored.
  { matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/api/"), handler: new NetworkOnly() },
  // Pages and RSC payloads render the signed-in user's data. Offline navigations fall back to /offline.
  { matcher: ({ request, sameOrigin }) => sameOrigin && (request.mode === "navigate" || isRsc(request)), handler: new NetworkOnly() },
  // Hashed build output never changes under the same URL, so the first copy is good forever.
  {
    matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
    handler: new CacheFirst({
      cacheName: STATIC_CACHE,
      plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 256, maxAgeSeconds: 60 * 60 * 24 * 365 })],
    }),
  },
  // App icons and the favicon: shown instantly, refreshed in the background.
  {
    matcher: ({ sameOrigin, url }) => sameOrigin && (url.pathname.startsWith("/icons/") || url.pathname === "/icon.png" || url.pathname.startsWith("/splash/")),
    handler: new StaleWhileRevalidate({
      cacheName: ICON_CACHE,
      plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 })],
    }),
  },
  {
    matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname === "/manifest.webmanifest",
    handler: new StaleWhileRevalidate({ cacheName: MANIFEST_CACHE, plugins: [new CacheableResponsePlugin({ statuses: [200] })] }),
  },
  // Anything else (cross-origin avatars, unknown same-origin GETs): straight to the network.
  { matcher: () => true, handler: new NetworkOnly() },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // The page asks before a new worker takes over (see the "SKIP_WAITING" message), so an open tab
  // never runs old JavaScript against chunks a new deploy has already replaced.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  precacheOptions: { cleanupOutdatedCaches: true },
  runtimeCaching,
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

async function dropCaches(keep: (name: string) => boolean) {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => !keep(name)).map((name) => caches.delete(name)));
}

const isPrecache = (name: string) => name.includes("precache");

self.addEventListener("activate", (event) => {
  // Clear what older workers left: the earlier worker used Serwist's defaultCache, which stored
  // pages, RSC payloads and /api/ responses ("pages", "pages-rsc", "apis", "others"…). Drop them all.
  event.waitUntil(dropCaches((name) => isPrecache(name) || KEEP.has(name)));
});

self.addEventListener("message", (event) => {
  // Sent by the app on sign-out. Nothing private is cached by design; this also removes anything a
  // future route might add by mistake.
  if (event.data?.type === "khata:sign-out") {
    event.waitUntil(dropCaches((name) => isPrecache(name) || KEEP.has(name)));
  }
});

type PushPayload = { title?: string; body?: string; url?: string; tag?: string };

/** A same-origin path to open, or "/". "//evil.com" starts with a slash too, so build the URL and compare origins. */
function sameOriginPath(raw: unknown) {
  if (typeof raw !== "string" || !raw.startsWith("/")) return "/";
  try {
    const target = new URL(raw, self.location.origin);
    return target.origin === self.location.origin ? `${target.pathname}${target.search}${target.hash}` : "/";
  } catch {
    return "/";
  }
}

/**
 * Push notifications carry shared expense and settlement activity. The payload
 * holds only a title, a body (amounts only when the recipient opted in), and a
 * deep link — the worker never fetches, so no private data enters the cache.
 */
self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  try {
    payload = (event.data?.json() as PushPayload | null) ?? {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === "string" && payload.title ? payload.title : "Khata";
  const body = typeof payload.body === "string" && payload.body ? payload.body : "Shared activity in your book.";
  const url = sameOriginPath(payload.url);
  const tag = typeof payload.tag === "string" && payload.tag ? payload.tag : "khata-shared";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-monochrome-512.png",
      data: { url },
      // A second push for the same record replaces the first; without this Android swaps it in silently.
      renotify: true,
    } as NotificationOptions),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data as { url?: unknown } | null)?.url;
  const url = sameOriginPath(raw);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => "focus" in client);
      const target = new URL(url, self.location.origin).href;
      if (open && "navigate" in open && typeof open.navigate === "function") {
        await open.navigate(target);
        return open.focus();
      }
      if (open) {
        await open.focus();
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

serwist.addEventListeners();
