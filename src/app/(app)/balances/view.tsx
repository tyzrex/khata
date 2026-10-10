"use client";

import { BalancesView } from "@/components/balances-view";
import { useKhata } from "@/components/khata-provider";

export function BalancesPage() {
  const khata = useKhata();
  return <BalancesView book={khata.shares.book} onSettle={(debt, groupId) => khata.openSettle(debt, groupId)} />;
}
