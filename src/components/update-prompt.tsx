"use client";

import { RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const DISMISSED = "khata:update-dismissed";

/** Which build the person already dismissed an update prompt for. */
const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "local";

function dismissedBuild() {
  try {
    return localStorage.getItem(DISMISSED) ?? "";
  } catch {
    return "";
  }
}

/**
 * Shows when a new service worker is installed and waiting. The worker never takes over an
 * open tab on its own (skipWaiting is off), so the person chooses when to reload.
 *
 * This watches the registration directly rather than going through Serwist's event bridge:
 * a waiting worker is a property of the registration, and reading it on mount means the prompt
 * still appears when the worker was already waiting before this component ran — which is the
 * common case, since the browser checks for a new worker during the navigation that loaded it.
 * A one-shot event alone misses exactly that, and Serwist re-dispatches its `waiting` event on
 * every register, so the prompt came back on every page load.
 *
 * The dismissal is remembered per build. Without it, a worker left waiting by
 * `skipWaiting: false` re-shows the prompt forever, which is what made it unreadable.
 */
export function UpdatePrompt() {
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;

    const show = () => {
      if (!cancelled) setWaiting(dismissedBuild() !== BUILD);
    };

    navigator.serviceWorker.getRegistration("/").then((registration) => {
      if (cancelled || !registration) return;
      if (registration.waiting) show();

      // A worker installed during this visit reaches `waiting` through these transitions.
      const track = (worker: ServiceWorker | null) => {
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) show();
        });
      };
      track(registration.waiting);
      track(registration.installing);
      registration.addEventListener("updatefound", () => track(registration.installing));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(() => {
    // Reload only once the new worker actually controls the page, or the old assets are still live.
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    // `skipWaiting` is off in src/sw.ts, so the worker only activates when asked.
    navigator.serviceWorker.getRegistration("/").then((registration) => registration?.waiting?.postMessage({ type: "SKIP_WAITING" }));
  }, []);

  function later() {
    try {
      localStorage.setItem(DISMISSED, BUILD);
    } catch {
      // Private mode or blocked storage: the prompt returns on the next load, as it did before.
    }
    setWaiting(false);
  }

  if (!waiting) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex items-center gap-3 rounded-2xl bg-card p-3 pl-4 shadow-lift sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96 lg:bottom-6"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground" aria-hidden>
        <RefreshCw className="size-4" />
      </span>
      <p className="min-w-0 flex-1 text-sm leading-5 text-foreground">
        <span className="block font-semibold text-display">Update ready</span>
        <span className="text-xs text-muted-foreground">Reload to get the latest Khata.</span>
      </p>
      <Button type="button" size="sm" onClick={reload}>
        Reload
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" className="size-8 min-h-0 rounded-lg px-0 hover:bg-secondary" aria-label="Later" onClick={later}>
        <X />
      </Button>
    </div>
  );
}
