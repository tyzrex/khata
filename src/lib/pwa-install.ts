"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Chrome fires `beforeinstallprompt` only if a listener calls `preventDefault()`, and the event
 * is one-shot: once used it cannot be shown again. So the listener is attached at module load
 * rather than in an effect — it can fire before React has mounted, and a missed event means no
 * install prompt for the rest of the session.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = {
  /** The browser offered an install prompt we are holding. */
  canPrompt: boolean;
  /** iOS Safari never fires the event; it installs from the Share sheet instead. */
  needsManualSteps: boolean;
  installed: boolean;
};

const listeners = new Set<() => void>();
let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { canPrompt: false, needsManualSteps: false, installed: false };

function emit() {
  listeners.forEach((listener) => listener());
}

/** iPadOS 13+ reports a desktop UA, so a Mac with a touchscreen is an iPad. */
export function isIosLike() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** True when the page is running as an installed app rather than inside a browser tab. */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  // display-mode is the standard check; navigator.standalone is the legacy iOS one.
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function sync() {
  const installed = isStandalone();
  state = {
    canPrompt: deferred !== null,
    // iOS only gets the manual route while it is not already on the home screen.
    needsManualSteps: !installed && isIosLike(),
    installed,
  };
  emit();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    sync();
  });
  window.addEventListener("appinstalled", () => {
    // The event cannot be replayed, so drop it and remember that we are installed.
    deferred = null;
    sync();
  });
  // Leaving standalone (uninstalling) should make the offer available again.
  window.matchMedia("(display-mode: standalone)").addEventListener("change", sync);
  sync();
}

const serverState: InstallState = { canPrompt: false, needsManualSteps: false, installed: false };

export function useInstallState() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => serverState,
  );
}

/**
 * Show the browser's own install dialog. Resolves to how the person answered, or `null` if the
 * browser has nothing to offer (already installed, or the offer was never captured).
 */
export function useInstallPrompt() {
  const install = useCallback(async () => {
    if (!deferred) return null;
    const event = deferred;
    deferred = null;
    sync();
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") sync();
    return outcome;
  }, []);
  return install;
}

/** True only when the browser has actually offered an install prompt. */
export function canInstallHere() {
  return typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "onbeforeinstallprompt" in window;
}