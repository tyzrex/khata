"use client";

import { ActivityView } from "@/components/activity-view";
import { useKhata } from "@/components/khata-provider";
import { toast } from "@/lib/status";

export function ActivityPage() {
  const khata = useKhata();
  return (
    <ActivityView
      book={khata.shares.book}
      onEditExpense={(expense) => khata.openExpense(expense.groupId, expense)}
      onDeleteSettlement={async (id) => {
        await khata.shares.deleteSettlement(id);
        toast.success("Settlement removed");
      }}
    />
  );
}
