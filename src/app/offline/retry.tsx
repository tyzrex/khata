"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

/** Reload when the connection returns, and on demand. The service worker serves this page only while offline. */
export function Retry() {
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const onOnline = () => window.location.replace("/");
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return (
    <button
      type="button"
      disabled={checking}
      onClick={() => {
        setChecking(true);
        window.location.replace("/");
      }}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors duration-200 outline-none hover:bg-primary-active focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
    >
      <RefreshCw className={checking ? "size-4 animate-spin" : "size-4"} aria-hidden />
      {checking ? "Checking" : "Try again"}
    </button>
  );
}
