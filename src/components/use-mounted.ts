"use client";

import { useSyncExternalStore } from "react";

const neverChanges = () => () => undefined;

/**
 * False while prerendering and on the first client render, true from the second onwards.
 *
 * `cacheComponents` prerenders client components, and anything that reads the clock or
 * browser-only state while doing so is a build error. Gate that work behind this so it
 * only ever runs in the browser. `useSyncExternalStore` is used rather than an effect so
 * the very first client render already agrees with what was prerendered, instead of
 * flashing a fallback and correcting itself.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}
