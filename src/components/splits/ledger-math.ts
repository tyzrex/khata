import type { BalanceScope, ShareBook } from "@/db/shares";

/** Pure arithmetic for the split screens. No React here, so the numbers can be checked in isolation. */

export type Expense = ShareBook["expenses"][number];
export type Settlement = ShareBook["settlements"][number];
export type Person = ShareBook["people"][number];

/** Below this a balance counts as settled; amounts are rounded to paisa. */
export const SETTLED = 0.005;

export function hasOpenBalance(scope: BalanceScope) {
  return [...scope.youOwe, ...scope.youAreOwed].some((debt) => debt.amount >= SETTLED);
}

const paisa = (value: number) => Math.round(value * 100) / 100;

/** What one expense did for you: lent the others' part, borrowed your part, or nothing. `withId` narrows it to one friend. */
export type Effect = { kind: "lent" | "borrowed"; amount: number } | { kind: "none"; label: "not involved" | "your own" };

export function effectOf(expense: Expense, selfId: string, withId?: string): Effect {
  const mine = expense.splits.find((split) => split.personId === selfId)?.amount ?? 0;
  if (expense.paidById === selfId) {
    const lent = withId ? (expense.splits.find((split) => split.personId === withId)?.amount ?? 0) : expense.amount - mine;
    return lent > SETTLED ? { kind: "lent", amount: paisa(lent) } : { kind: "none", label: mine > SETTLED ? "your own" : "not involved" };
  }
  if (withId && expense.paidById !== withId) return { kind: "none", label: "not involved" };
  return mine > SETTLED ? { kind: "borrowed", amount: paisa(mine) } : { kind: "none", label: "not involved" };
}

export type FeedItem = { kind: "expense"; date: string; id: string; expense: Expense } | { kind: "settlement"; date: string; id: string; settlement: Settlement };

/** Expenses and payments together, newest first. */
export function feedOf(expenses: Expense[], settlements: Settlement[]): FeedItem[] {
  return [
    ...expenses.map((expense) => ({ kind: "expense" as const, date: expense.date, id: expense.id, expense })),
    ...settlements.map((settlement) => ({ kind: "settlement" as const, date: settlement.date, id: settlement.id, settlement })),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** Consecutive runs that share a label (a month, in the caller's calendar). Input must already be sorted. */
export function runsBy<T>(items: T[], label: (item: T) => string) {
  const runs: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const key = label(item);
    const last = runs.at(-1);
    if (last && last.label === key) last.items.push(item);
    else runs.push({ label: key, items: [item] });
  }
  return runs;
}

export type MemberLine = {
  id: string;
  name: string;
  /** What they paid for the group, minus payments they received back. */
  paid: number;
  /** Their part of every expense. */
  share: number;
  /** Positive: the group owes them. Negative: they owe the group. */
  net: number;
};

/**
 * Every member's position inside one group, worked out from the group's own
 * expenses and payments. Someone who left but still appears in old expenses
 * keeps a line, named from those expenses.
 */
export function memberLines(members: Person[], expenses: Expense[], settlements: Settlement[]): MemberLine[] {
  const lines = new Map<string, MemberLine>();
  const line = (id: string, name: string) => {
    let found = lines.get(id);
    if (!found) {
      found = { id, name, paid: 0, share: 0, net: 0 };
      lines.set(id, found);
    }
    return found;
  };
  for (const member of members) line(member.id, member.name);
  for (const expense of expenses) {
    line(expense.paidById, expense.paidByName).paid += expense.amount;
    for (const split of expense.splits) line(split.personId, split.name).share += split.amount;
  }
  for (const settlement of settlements) {
    // The payer is paying a debt off: their position rises. The receiver's falls by the same amount.
    line(settlement.fromPersonId, settlement.fromName).net += settlement.amount;
    line(settlement.toPersonId, settlement.toName).net -= settlement.amount;
  }
  return [...lines.values()].map((entry) => ({
    ...entry,
    paid: paisa(entry.paid),
    share: paisa(entry.share),
    net: paisa(entry.net + entry.paid - entry.share),
  }));
}

export function totalsFor(expenses: Expense[], selfId: string) {
  let spend = 0;
  let yourShare = 0;
  let youPaid = 0;
  for (const expense of expenses) {
    spend += expense.amount;
    yourShare += expense.splits.find((split) => split.personId === selfId)?.amount ?? 0;
    if (expense.paidById === selfId) youPaid += expense.amount;
  }
  return { spend: paisa(spend), yourShare: paisa(yourShare), youPaid: paisa(youPaid) };
}

/** "Sameer", or "You" when it is you. */
export function who(id: string, name: string, selfId: string, lower = false) {
  if (id !== selfId) return name;
  return lower ? "you" : "You";
}
