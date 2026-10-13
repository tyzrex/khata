import { friendEntries } from "@/components/splits/friend-entries";
import type { ShareBook } from "@/db/shares";

export type DashboardDebt = {
  key: string;
  name: string;
  amount: number;
  incoming: boolean;
  context: string;
  href: string;
  groupId: string | null;
  personId: string;
};

/** Preserve identity and each book's outstanding payments, even when their nets cancel. */
export function dashboardDebts(book: ShareBook): DashboardDebt[] {
  const friends = friendEntries(book).flatMap((entry) =>
    entry.rows.map((row) => ({
      key: `${entry.own ? "own" : "joined"}:${entry.id}:${row.id ?? "outside"}`,
      name: entry.friend.name,
      amount: Math.abs(row.net),
      incoming: row.net > 0,
      context: row.name,
      href: `/friends/${encodeURIComponent(entry.id)}`,
      groupId: row.id,
      personId: entry.friend.id,
    })),
  );
  const groups = book.joinedGroups
    .filter((group) => group.kind === "group")
    .flatMap((group) => [
      ...group.balances.youOwe.map((debt) => ({
        key: `${group.id}:owe:${debt.toId}`,
        name: debt.toName,
        amount: debt.amount,
        incoming: false,
        context: group.name,
        href: `/groups/${encodeURIComponent(group.id)}`,
        groupId: group.id,
        personId: debt.toId,
      })),
      ...group.balances.youAreOwed.map((debt) => ({
        key: `${group.id}:owed:${debt.fromId}`,
        name: debt.fromName,
        amount: debt.amount,
        incoming: true,
        context: group.name,
        href: `/groups/${encodeURIComponent(group.id)}`,
        groupId: group.id,
        personId: debt.fromId,
      })),
    ]);
  return [...friends, ...groups]
    .filter((row) => row.amount >= 0.005)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}
