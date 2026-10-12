"use client";

import { RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const HANDLED = "khata:update-handled";

/**
 * How long the prompt is left alone before it puts itself away.
 *
 * It used to wait for a click. That made it a permanent fixture: a bar parked
 * across the bottom of every screen, over the tab bar on a phone, on every
 * navigation and every reload, for as long as nobody happened to dismiss it. The
 * update it was offering is real but not urgent — the old worker is still
 * serving a working app — so it earns a moment of attention and no more.
 */
const VISIBLE_MS = 10_000;

function handledBuild() {
  try {
    return localStorage.getItem(HANDLED) ?? "";
  } catch {
    return "";
  }
}

function rememberHandled(buildId: string) {
  try {
    localStorage.setItem(HANDLED, buildId);
  } catch {
    // Private mode or blocked storage: the prompt returns next load, as it did before.
  }
}

/**
 * Fingerprint the worker this browser would install.
 *
 * The obvious key was a build id baked into the page bundle, and it was wrong in
 * both directions: on Vercel it is the commit, so a preview deployment that
 * rebuilds on every push announced a new "update" each time, while locally it is
 * the literal string "local", so one dismissal silenced the prompt through every
 * build afterwards — including the ones that really did change things.
 *
 * The worker's own bytes are the ground truth: they are what the browser compares
 * to decide there is a new worker at all. This costs one ~40 KB read, and only
 * when a worker is actually waiting, which is the only time the answer is wanted.
 */
async function workerFingerprint(): Promise<string | null> {
  try {
    const response = await fetch("/sw.js", { cache: "no-store" });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    // FNV-1a: short, stable, and only ever compared against another one of these.
    let hash = 0x811c9dc5;
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193);
    }
    return `${bytes.length.toString(36)}-${(hash >>> 0).toString(36)}`;
  } catch {
    return null;
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
 * Which build someone has already been told about is remembered against the worker
 * that asked, and both answers count: pressing Later and letting it time out. One
 * prompt per worker is the promise; without it a worker left waiting by
 * `skipWaiting: false` re-shows it forever, which is what made it unreadable.
 * Nobody loses anything by the timeout — the app they are using is the one they
 * have been using all along, and the next worker offers itself again.
 */
export function UpdatePrompt() {
  const [offer, setOffer] = useState<{ worker: ServiceWorker; fingerprint: string } | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;

    const consider = async (worker: ServiceWorker | null) => {
      if (!worker || cancelled) return;
      const fingerprint = await workerFingerprint();
      // A worker we cannot fingerprint is one we cannot tell from the last one, so
      // there is nothing to offer that is provably new.
      if (!cancelled && fingerprint && fingerprint !== handledBuild()) setOffer({ worker, fingerprint });
    };

    navigator.serviceWorker.getRegistration("/").then((registration) => {
      if (cancelled || !registration) return;
      void consider(registration.waiting);

      // A worker installed during this visit reaches `waiting` through these transitions.
      const track = (worker: ServiceWorker | null) => {
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) void consider(worker);
        });
      };
      track(registration.installing);
      registration.addEventListener("updatefound", () => track(registration.installing));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Put itself away, and remember that it did. Both answers count — clicked away
  // or let run out — so one prompt per distinct worker is the promise.
  useEffect(() => {
    if (!offer) return;
    const timer = window.setTimeout(() => {
      rememberHandled(offer.fingerprint);
      setOffer(null);
    }, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [offer]);

  const reload = useCallback(() => {
    // Remember before reloading: the new worker is about to take over, and a prompt
    // for a build that is already live is exactly the noise this is meant to stop.
    if (offer) rememberHandled(offer.fingerprint);
    // Reload only once the new worker actually controls the page, or the old assets are still live.
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    // `skipWaiting` is off in src/sw.ts, so the worker only activates when asked.
    offer?.worker.postMessage({ type: "SKIP_WAITING" });
  }, [offer]);

  function later() {
    if (offer) rememberHandled(offer.fingerprint);
    setOffer(null);
  }

  if (!offer) return null;

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
        <span className="text-[13px] text-muted-foreground">Reload to get the latest Khata.</span>
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