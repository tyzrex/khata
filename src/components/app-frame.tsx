"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { authClient } from "@/lib/auth-client";

export type LaunchAction = "add" | "split";

type FrameActions = {
  user: { name: string; email: string };
  /** An action asked for from the shell before (or after) the data is ready. The data layer opens it. */
  pending: LaunchAction | null;
  request: (action: LaunchAction) => void;
  clear: () => void;
  signOut: () => void;
};

const FrameContext = createContext<FrameActions | null>(null);

export function useFrame() {
  const value = useContext(FrameContext);
  if (!value) throw new Error("useFrame must be used inside AppFrame");
  return value;
}

/**
 * The part of the signed-in screen that needs no ledger data: navigation, the user
 * card, and the Add and Split buttons. It paints at once; the pages stream in under it.
 */
export function AppFrame({ user, today, children }: { user: { name: string; email: string }; today: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState<LaunchAction | null>(null);

  function signOut() {
    // The service worker drops its caches so nothing from this session outlives it on a shared device.
    navigator.serviceWorker?.controller?.postMessage({ type: "khata:sign-out" });
    void authClient.signOut().then(() => {
      router.push("/login");
      router.refresh();
    });
  }

  const actions: FrameActions = { user, pending, request: setPending, clear: () => setPending(null), signOut };

  return (
    <FrameContext value={actions}>
      <AppShell user={user} today={today} onAdd={() => setPending("add")} onSplit={() => setPending("split")} onSignOut={signOut}>
        {children}
      </AppShell>
    </FrameContext>
  );
}
