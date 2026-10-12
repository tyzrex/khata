import { roundMoney } from "@/lib/money";
import type { ShareBook } from "@/db/shares";
import { formatNpr } from "@/lib/format";
import type { TransactionDto } from "@/lib/types";
import { netOf } from "@/server/agent/plan";

/** Read-side shapes for the agent API: flat, named, and with a sentence a bot can repeat. */

export type GroupView = {
  id: string;
  name: string;
  owned: boolean;
  owner: string | null;
  members: string[];
  net: number;
  summary: string;
  balances: string[];
  totalSpent: number;
  expenseCount: number;
};

export function groupViews(book: ShareBook): GroupView[] {
  const owned = book.groups
    .filter((group) => group.kind === "group")
    .map((group) => {
      const expenses = book.expenses.filter((expense) => expense.groupId === group.id);
      return view(group.id, group.name, true, null, group.members, book.self.id, group.balances, expenses);
    });
  const joined = book.joinedGroups
    .filter((group) => group.kind === "group")
    .map((group) => view(group.id, group.name, false, group.ownerName, group.members, group.self.id, group.balances, group.expenses));
  return [...owned, ...joined];
}

function view(
  id: string,
  name: string,
  owned: boolean,
  owner: string | null,
  members: { id: string; name: string }[],
  selfId: string,
  balances: ShareBook["overall"],
  expenses: ShareBook["expenses"],
): GroupView {
  const net = netOf(balances);
  const lines = [
    ...balances.youAreOwed.map((debt) => `${debt.fromName} owes you ${formatNpr(debt.amount)}`),
    ...balances.youOwe.map((debt) => `You owe ${debt.toName} ${formatNpr(debt.amount)}`),
    ...balances.others.map((debt) => `${debt.fromName} owes ${debt.toName} ${formatNpr(debt.amount)}`),
  ];
  return {
    id,
    name,
    owned,
    owner,
    members: members.map((member) => (member.id === selfId ? "You" : member.name)),
    net,
    summary: Math.abs(net) < 0.005 ? `You are settled up in "${name}"` : net > 0 ? `You are owed ${formatNpr(net)} in "${name}"` : `You owe ${formatNpr(-net)} in "${name}"`,
    balances: lines,
    totalSpent: roundMoney(expenses.reduce((total, expense) => total + expense.amount, 0)),
    expenseCount: expenses.length,
  };
}

export type ExpenseView = {
  id: string;
  date: string;
  description: string;
  amount: number;
  group: string | null;
  groupId: string | null;
  paidBy: string;
  splitMode: string;
  category: string | null;
  shares: { name: string; amount: number }[];
  yourShare: number;
  note: string;
  summary: string;
};

/** Every shared expense you can see, newest first: your book and every book you joined. */
export function expenseViews(book: ShareBook): ExpenseView[] {
  const own = book.expenses.map((expense) => expenseView(expense, book.self.id));
  const joined = book.joinedGroups.flatMap((group) => group.expenses.map((expense) => expenseView(expense, group.self.id)));
  return [...own, ...joined].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

/** Exported so a single expense fetched by id is shaped identically to a listed one. */
export function expenseView(expense: ShareBook["expenses"][number], selfId: string): ExpenseView {
  const label = (id: string, name: string) => (id === selfId ? "You" : name);
  const paidBy = label(expense.paidById, expense.paidByName);
  const yourShare = expense.splits.find((split) => split.personId === selfId)?.amount ?? 0;
  return {
    id: expense.id,
    date: expense.date,
    description: expense.description,
    amount: expense.amount,
    group: expense.groupName,
    groupId: expense.groupId,
    paidBy,
    splitMode: expense.splitMode,
    category: expense.category,
    shares: expense.splits.map((split) => ({ name: label(split.personId, split.name), amount: split.amount })),
    yourShare,
    note: expense.note,
    summary: `${expense.date}: ${paidBy} paid ${formatNpr(expense.amount)} for "${expense.description}"${expense.groupName ? ` in ${expense.groupName}` : ""}; your share ${formatNpr(yourShare)}`,
  };
}

/** Spent is expenses only; credited is income plus transfers, matching the dashboard. */
export function transactionTotals(rows: TransactionDto[]) {
  const sum = (filter: (row: TransactionDto) => boolean) => roundMoney(rows.filter(filter).reduce((total, row) => total + row.amount, 0));
  return { count: rows.length, spent: sum((row) => row.type === "expense"), credited: sum((row) => row.type !== "expense") };
}

export function transactionSentence(row: TransactionDto) {
  const verb = row.type === "expense" ? "Spent" : row.type === "income" ? "Received" : "Transfer of";
  return `${verb} ${formatNpr(row.amount)} — ${row.merchant} (${row.category}, ${row.account}) on ${row.date}`;
}
