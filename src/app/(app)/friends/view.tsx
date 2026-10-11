"use client";

import { useParams, useRouter } from "next/navigation";
import { FriendsView } from "@/components/friends-view";
import { useKhata } from "@/components/khata-provider";

/** `/friends` lists them; `/friends/:id` opens one. On a wide screen both show side by side. */
export function FriendsPage() {
  const khata = useKhata();
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  return (
    <FriendsView
      book={khata.shares.book}
      selectedId={params.id ?? null}
      onSelect={(id) => router.push(id ? `/friends/${encodeURIComponent(id)}` : "/friends", { scroll: !id })}
      onSettle={(debt, groupId) => khata.openSettle(debt, groupId)}
      onAddExpense={(groupId) => khata.openExpense(groupId)}
      onEditExpense={(expense) => khata.openExpense(expense.groupId, expense)}
      onEditSettlement={khata.openSettlement}
      onGroups={() => router.push("/groups")}
      addFriend={khata.shares.addFriend}
      onRenamePerson={khata.shares.renamePerson}
      onDeletePerson={khata.shares.deletePerson}
      inviteActions={khata.inviteActions}
    />
  );
}
