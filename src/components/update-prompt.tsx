"use client";

import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSerwist } from "@serwist/next/react";
import { Button } from "@/components/ui/button";

/**
 * Shows when a new service worker is installed and waiting. The worker never takes over an
 * open tab on its own (skipWaiting is off), so the person chooses when to reload.
 */
export function UpdatePrompt() {
  const { serwist } = useSerwist();
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!serwist) return;
    const onWaiting = () => setWaiting(true);
    serwist.addEventListener("waiting", onWaiting);
    return () => serwist.removeEventListener("waiting", onWaiting);
  }, [serwist]);

  if (!waiting || !serwist) return null;

  function reload() {
    serwist?.addEventListener("controlling", () => window.location.reload());
    serwist?.messageSkipWaiting();
  }

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
      <Button type="button" variant="ghost" size="icon-sm" className="size-8 min-h-0 rounded-lg px-0 hover:bg-secondary" aria-label="Later" onClick={() => setWaiting(false)}>
        <X />
      </Button>
    </div>
  );
}
