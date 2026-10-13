"use client";

import { cn } from "cn";
import { useId, type ReactNode } from "react";

export function DetailTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  children,
}: {
  tabs: readonly { id: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <>
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 rounded-t-2xl border-b border-border bg-card px-2 sm:px-3"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${id}-tab-${tab.id}`}
            aria-selected={tab.id === value}
            aria-controls={`${id}-panel`}
            tabIndex={tab.id === value ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index - 1 + tabs.length) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              onChange(tabs[next].id);
              (
                event.currentTarget.parentElement?.children[
                  next
                ] as HTMLButtonElement
              )?.focus();
            }}
            className={cn(
              "relative flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-t-lg px-3 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:flex-none sm:px-4",
              tab.id === value
                ? "text-interactive after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-brand"
                : "text-muted-foreground hover:text-display",
            )}
          >
            {tab.label}
            {tab.count != null ? (
              <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                {tab.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${value}`}
        tabIndex={0}
        className="min-w-0 rounded-b-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </div>
    </>
  );
}
