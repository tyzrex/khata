"use client";

import { useKhata } from "@/components/khata-provider";
import { SyncView } from "@/components/sync-view";

export function SyncPage() {
  const khata = useKhata();
  return <SyncView onImport={khata.ledger.importPayload} onSample={khata.loadSample} accounts={khata.ledger.accounts.map((account) => account.name)} />;
}
