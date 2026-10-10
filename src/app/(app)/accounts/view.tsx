"use client";

import { AccountsView } from "@/components/accounts-view";
import { useKhata } from "@/components/khata-provider";

export function AccountsPage() {
  const { ledger } = useKhata();
  // Counted here rather than in the API: the whole ledger is already on the client,
  // and this is the only place that needs the tally.
  const usage: Record<string, { count: number }> = {};
  for (const transaction of ledger.transactions) {
    const entry = (usage[transaction.account] ??= { count: 0 });
    entry.count += 1;
  }

  return <AccountsView accounts={ledger.accounts} usage={usage} onSave={ledger.saveAccount} onDelete={ledger.removeAccount} />;
}