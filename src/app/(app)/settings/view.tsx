"use client";

import { useQuery } from "@tanstack/react-query";
import { useFrame } from "@/components/app-frame";
import { useKhata } from "@/components/khata-provider";
import { AccountSettings } from "@/components/account-settings";
import { accountQuery } from "@/components/account-query";
import { SettingsView } from "@/components/settings-view";

export function SettingsPage() {
  const { today } = useKhata();
  const { user, signOut } = useFrame();
  // Whether this account has a password decides which controls are meaningful, and it is not
  // knowable from the session alone, so ask the server. `null` until it answers keeps the
  // password controls hidden rather than flashing them and hiding them again.
  const { data } = useQuery(accountQuery);

  return <SettingsView today={today} account={<AccountSettings user={user} hasPassword={data?.hasPassword ?? null} onSignOut={signOut} />} />;
}