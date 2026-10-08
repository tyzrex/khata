"use client";

import { useSyncExternalStore } from "react";

export type ToastKind = "ok" | "error" | "info";
export type ToastItem = { id: number; kind: ToastKind; text: string; duration: number };

const MAX_VISIBLE = 4;
const DURATIONS: Record<ToastKind, number> = { ok: 3500, info: 4500, error: 7000 };

let items: ToastItem[] = [];
let counter = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function show(kind: ToastKind, text: string) {
  // The same message fired twice replaces itself instead of stacking.
  const rest = items.filter((item) => !(item.kind === kind && item.text === text));
  counter += 1;
  items = [...rest, { id: counter, kind, text, duration: DURATIONS[kind] }].slice(-MAX_VISIBLE);
  emit();
}

export function dismissToast(id: number) {
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return;
  items = next;
  emit();
}

/** Same call shape as before; the messages now render in the `Toaster`. */
export const toast = {
  success: (text: string) => show("ok", text),
  error: (text: string) => show("error", text),
  info: (text: string) => show("info", text),
  message: (text: string) => show("info", text),
};

const empty: ToastItem[] = [];

export function useToasts() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
    () => empty,
  );
}
