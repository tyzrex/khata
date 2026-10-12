"use client";

import { Check, CircleAlert, Info, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { dismissToast, useToasts, type ToastItem, type ToastKind } from "@/lib/status";

const looks: Record<ToastKind, { icon: LucideIcon; badge: string; bar: string; label: string }> = {
  ok: { icon: Check, badge: "bg-credit/12 text-credit", bar: "bg-credit", label: "Done" },
  error: { icon: CircleAlert, badge: "bg-negative/12 text-negative", bar: "bg-negative", label: "Something went wrong" },
  info: { icon: Info, badge: "bg-accent text-accent-foreground", bar: "bg-brand", label: "Note" },
};

function Toast({ item }: { item: ToastItem }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(item.duration);
  const look = looks[item.kind];
  const Icon = look.icon;

  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => dismissToast(item.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [paused, item.id]);

  return (
    <li
      className="pointer-events-auto relative flex animate-in items-center gap-3 overflow-hidden rounded-2xl bg-popover py-3 pr-2 pl-3 text-popover-foreground shadow-2xl ring-1 ring-foreground/5 duration-300 fade-in-0 slide-in-from-bottom-3"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${look.badge}`} aria-hidden>
        <Icon className="size-[18px]" strokeWidth={2.25} />
      </span>
      <p className="min-w-0 flex-1 text-sm leading-snug font-medium text-display">
        <span className="sr-only">{look.label}: </span>
        {item.text}
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismissToast(item.id)}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors duration-200 hover:bg-secondary hover:text-display focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" />
      </button>
      <span
        aria-hidden
        className={`toast-timer absolute inset-x-0 bottom-0 h-0.5 origin-left ${look.bar}`}
        style={{ animationDuration: `${item.duration}ms`, animationPlayState: paused ? "paused" : "running" }}
      />
    </li>
  );
}

/** Floating toast stack. Bottom right on desktop, above the tab bar on phones. */
export function Toaster() {
  const items = useToasts();
  return (
    <ol
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[70] flex flex-col gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[24rem] lg:right-8 lg:bottom-8"
    >
      {items.map((item) => (
        <Toast key={item.id} item={item} />
      ))}
    </ol>
  );
}
