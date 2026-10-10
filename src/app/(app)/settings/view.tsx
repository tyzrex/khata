"use client";

import { useEffect, useState } from "react";
import { useFrame } from "@/components/app-frame";
import { useKhata } from "@/components/khata-provider";
import { AccountSettings } from "@/components/account-settings";
import { SettingsView } from "@/components/settings-view";

export function SettingsPage() {
  const { today } = useKhata();
  const { user, signOut } = useFrame();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  // Whether this account has a password decides which controls are meaningful, and
  // it is not knowable from the session alone, so ask the server once.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/account")
      .then((response) => (response.ok ? (response.json() as Promise<{ hasPassword: boolean }>) : null))
      .then((body) => {
        if (!cancelled && body) setHasPassword(body.hasPassword);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return <SettingsView today={today} account={<AccountSettings user={user} hasPassword={hasPassword} onSignOut={signOut} />} />;
}