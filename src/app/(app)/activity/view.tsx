"use client";

import { ActivityView } from "@/components/activity-view";
import { useKhata } from "@/components/khata-provider";

export function ActivityPage() {
  const khata = useKhata();
  return (
    <ActivityView
      book={khata.shares.book}
      onEditExpense={(expense) => khata.openExpense(expense.groupId, expense)}
      onEditSettlement={khata.openSettlement}
    />
  );
}
