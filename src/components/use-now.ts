"use client";

import { useSyncExternalStore } from "react";

/** The clock only needs minute resolution, which is all a relative stamp can show. */
const TICK_MS = 60_000;

const listeners = new Set<() => void>();
let timer: number | null = null;
/** Cached so `getSnapshot` is stable between calls; zero means "no clock yet". */
let tick = 0;

function publish() {
  const next = Math.floor(Date.now() / TICK_MS);
  if (next === tick) return;
  tick = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // The first subscriber primes the clock and owns the timer, so several components
  // asking for the time do not each start their own.
  if (listeners.size === 1) {
    publish();
    timer = window.setInterval(publish, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * The current time, quantised to the minute, or null until the browser has one.
 *
 * Reading `Date.now()` during render is not allowed: components must be pure, and
 * `cacheComponents` prerenders them, where the clock is a build error. This is the
 * sanctioned way to read changing external state: the server snapshot is 0, so the
 * prerendered tree and the first client render agree, and the real time arrives through
 * the subscription rather than during render.
 *
 * Consumers must treat null as "no clock yet" and fall back to an absolute date. The
 * value is truncated to the minute, which rounds an age down — never up — so a stamp
 * can lag by at most a minute but never claim more time has passed than really did.
 */
export function useNow(): number | null {
  const current = useSyncExternalStore(subscribe, () => tick, () => 0);
  return current === 0 ? null : current * TICK_MS;
}
