"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { formatEntryDate, formatFullDate, formatLongDate, formatMonthYear, formatRange } from "@/lib/format";
import { AD_STYLE, type CalendarKind, type DateStyle, type Script } from "@/lib/nepali-date";

const KEY = "khata.date-style";
const listeners = new Set<() => void>();

function readRaw() {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function parse(raw: string): DateStyle {
  try {
    const value = JSON.parse(raw) as Partial<DateStyle>;
    return {
      calendar: value.calendar === "BS" ? "BS" : "AD",
      script: value.script === "np" ? "np" : "en",
    };
  } catch {
    return AD_STYLE;
  }
}

/** Saved in this browser only. The database always keeps AD dates. */
export function setDateStyle(next: Partial<DateStyle>) {
  const merged = { ...parse(readRaw()), ...next };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // Storage can be blocked; the choice then lasts until the next reload.
  }
  for (const listener of listeners) listener();
}

export function useDateStyle() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const style = useMemo(() => (raw ? parse(raw) : AD_STYLE), [raw]);
  const setCalendar = useCallback((calendar: CalendarKind) => setDateStyle({ calendar }), []);
  const setScript = useCallback((script: Script) => setDateStyle({ script }), []);
  return { style, setCalendar, setScript };
}

/** Date formatters already bound to the user's calendar. */
export function useDateFormat() {
  const { style } = useDateStyle();
  return useMemo(
    () => ({
      style,
      entry: (iso: string) => formatEntryDate(iso, style),
      long: (iso: string) => formatLongDate(iso, style),
      full: (iso: string) => formatFullDate(iso, style),
      monthYear: (iso: string) => formatMonthYear(iso, style),
      range: (start: string, end: string) => formatRange(start, end, style),
    }),
    [style],
  );
}
