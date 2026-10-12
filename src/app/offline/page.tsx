import type { Metadata } from "next";
import { CloudOff, Lock, RefreshCw } from "lucide-react";
import { Mark } from "@/components/mark";
import { Retry } from "./retry";

export const metadata: Metadata = { title: "Offline" };

const notes = [
  { icon: Lock, title: "Your book is safe", text: "Entries, splits and balances live on the server. Nothing was lost." },
  { icon: CloudOff, title: "Nothing private is stored here", text: "Khata keeps no copy of your ledger on this device, so balances need a connection." },
  { icon: RefreshCw, title: "It comes back by itself", text: "This page reloads as soon as you are online again." },
] as const;

/** Served by the service worker when a page cannot load. Precached, static, no data. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10" style={{ paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}>
      <div className="flex items-center gap-3 px-1">
        <Mark className="size-9" />
        <span className="text-[17px] font-semibold tracking-[-0.03em] text-display">Khata</span>
      </div>

      <section className="mt-8 rounded-3xl bg-card p-5 shadow-card sm:p-6">
        <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground" aria-hidden>
          <CloudOff className="size-5" />
        </span>
        <p className="mt-5 text-[13px] font-medium text-muted-foreground">No connection</p>
        <h1 className="display mt-1.5 text-[28px]">You are offline</h1>
        <p className="mt-2 text-sm leading-6 text-pretty text-muted-foreground">Check your Wi-Fi or mobile data. Khata opens again the moment you are back.</p>

        <ul className="mt-5 divide-y divide-border border-y border-border">
          {notes.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3 py-3">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-display">{title}</span>
                <span className="mt-0.5 block text-[13px] leading-5 text-muted-foreground">{text}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-5">
          <Retry />
        </div>
      </section>
    </main>
  );
}
