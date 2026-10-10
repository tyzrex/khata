import { SETTLED, type Expense, type Person, type Settlement } from "@/components/splits/ledger-math";
import type { BalanceScope, JoinedGroup, ShareBook } from "@/db/shares";
import { formatNpr } from "@/lib/format";

type Debt = BalanceScope["youOwe"][number];

/** One line per shared book with this friend: a group, the direct book, or entries outside any group. */
export type BookRow = { id: string | null; name: string; direct: boolean; net: number };

/**
 * A friend as seen from your side. `own` friends live in your book. Friends who
 * invited you live in their book: you reach them through the direct group they own.
 */
export type FriendEntry = {
  /** The id in `/friends/:id`: the person id for your own friends, the direct book id for friends who invited you. */
  id: string;
  friend: Person;
  selfId: string;
  own: boolean;
  /** Positive: they owe you. Negative: you owe them. */
  net: number;
  directId: string | null;
  rows: BookRow[];
  expenses: Expense[];
  settlements: Settlement[];
};

function netWith(scope: BalanceScope, friendId: string) {
  const owed = scope.youAreOwed.filter((debt) => debt.fromId === friendId).reduce((total, debt) => total + debt.amount, 0);
  const owe = scope.youOwe.filter((debt) => debt.toId === friendId).reduce((total, debt) => total + debt.amount, 0);
  return owed - owe;
}

export function settleDebt(entry: FriendEntry, net: number): Debt {
  return net > 0
    ? { fromId: entry.friend.id, toId: entry.selfId, fromName: entry.friend.name, toName: "You", amount: net }
    : { fromId: entry.selfId, toId: entry.friend.id, fromName: "You", toName: entry.friend.name, amount: -net };
}

function ownEntry(book: ShareBook, friend: Person): FriendEntry {
  const net = netWith(book.overall, friend.id);
  const rows: BookRow[] = book.groups
    .filter((group) => group.members.some((member) => member.id === friend.id))
    .map((group) => ({ id: group.id, name: group.kind === "direct" ? "Just the two of you" : group.name, direct: group.kind === "direct", net: netWith(group.balances, friend.id) }));
  const outside = net - rows.reduce((total, row) => total + row.net, 0);
  if (Math.abs(outside) >= SETTLED) rows.push({ id: null, name: "Outside groups", direct: false, net: outside });
  return {
    id: friend.id,
    friend,
    selfId: book.self.id,
    own: true,
    net,
    directId: book.groups.find((group) => group.kind === "direct" && group.members.some((member) => member.id === friend.id))?.id ?? null,
    rows,
    expenses: book.expenses.filter((expense) => expense.paidById === friend.id || expense.splits.some((split) => split.personId === friend.id)),
    settlements: book.settlements.filter((settlement) => settlement.fromPersonId === friend.id || settlement.toPersonId === friend.id),
  };
}

function joinedEntry(group: JoinedGroup): FriendEntry | null {
  const friend = group.members.find((member) => !member.isSelf);
  if (!friend) return null;
  const net = netWith(group.balances, friend.id);
  return {
    id: group.id,
    friend: { ...friend, name: group.name },
    selfId: group.self.id,
    own: false,
    net,
    directId: group.id,
    rows: [{ id: group.id, name: "Just the two of you", direct: true, net }],
    expenses: group.expenses,
    settlements: group.settlements,
  };
}

/** Who owes you most first, then whom you owe most, then everyone settled by name. */
function byWhoOwes(a: FriendEntry, b: FriendEntry) {
  const rank = (entry: FriendEntry) => (entry.net >= SETTLED ? 0 : entry.net <= -SETTLED ? 1 : 2);
  return rank(a) - rank(b) || Math.abs(b.net) - Math.abs(a.net) || a.friend.name.localeCompare(b.friend.name);
}

export function friendEntries(book: ShareBook): FriendEntry[] {
  return [
    ...book.people.filter((person) => !person.isSelf).map((friend) => ownEntry(book, friend)),
    ...book.joinedGroups.filter((group) => group.kind === "direct").map(joinedEntry).filter((entry): entry is FriendEntry => entry !== null),
  ].sort(byWhoOwes);
}

/** "owes you NPR 1,425", "you owe NPR 300", or "settled up". */
export function friendPosition(net: number) {
  if (Math.abs(net) < SETTLED) return { text: "settled up", tone: "text-muted-foreground" };
  return net > 0 ? { text: `owes you ${formatNpr(net)}`, tone: "text-credit" } : { text: `you owe ${formatNpr(-net)}`, tone: "text-warning" };
}

export function accountNote(entry: FriendEntry) {
  if (!entry.own) return "Invited you to Khata";
  return entry.friend.linkedUserId ? "On Khata" : "Not on Khata yet";
}
