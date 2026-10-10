"use client";

import { useParams, useRouter } from "next/navigation";
import { GroupsView } from "@/components/groups-view";
import { useKhata } from "@/components/khata-provider";

/** `/groups` lists them; `/groups/:id` opens one. On a wide screen both show side by side. */
export function GroupsPage() {
  const khata = useKhata();
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  return (
    <GroupsView
      book={khata.shares.book}
      selectedId={params.id ?? null}
      onSelect={(id) => router.push(id ? `/groups/${encodeURIComponent(id)}` : "/groups", { scroll: !id })}
      onSettle={(debt, groupId) => khata.openSettle(debt, groupId)}
      onAddExpense={(groupId) => khata.openExpense(groupId)}
      onEditExpense={(expense) => khata.openExpense(expense.groupId, expense)}
      onCreateGroup={khata.shares.createGroup}
      onUpdateGroup={khata.shares.updateGroup}
      onDeleteGroup={khata.shares.deleteGroup}
      inviteActions={khata.inviteActions}
    />
  );
}
