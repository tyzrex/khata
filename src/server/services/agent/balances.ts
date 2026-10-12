import { getShareBook } from "@/db/shares";
import { balanceLines, friendBalances, netOf } from "@/server/agent/plan";
import { groupViews } from "@/server/agent/views";
import { formatNpr } from "@/lib/format";

/** Money only ever moves in paisa, so every total here is rounded back to 2dp. */
const paisa = (amount: number) => Math.round(amount * 100) / 100;

/** Below half a paisa a balance is not worth reporting. */
const settled = (amount: number) => Math.abs(amount) < 0.005;

export type BalanceView = {
  net: number;
  youAreOwed: number;
  youOwe: number;
  lines: string[];
  friends: ReturnType<typeof friendBalances>;
  groups: ReturnType<typeof groupViews>;
  simplest: { from: string; to: string; amount: number }[];
};

export type Rendered<T> = { data: T; message: string; status?: number };

/**
 * Who owes whom: overall, per friend, per group, and the fewest payments that
 * settle your own book.
 *
 * Your own book and any group you were invited into are both real debts, so the
 * headline net adds them together — being owed money by a group you joined is
 * still being owed money.
 */
export async function balancesView(userId: string): Promise<Rendered<BalanceView>> {
  const book = await getShareBook(userId);
  const sum = (list: { amount: number }[]) => list.reduce((total, debt) => total + debt.amount, 0);
  const across = (pick: (group: (typeof book.joinedGroups)[number]) => number) => book.joinedGroups.reduce((total, group) => total + pick(group), 0);

  const youAreOwed = paisa(sum(book.overall.youAreOwed) + across((group) => sum(group.balances.youAreOwed)));
  const youOwe = paisa(sum(book.overall.youOwe) + across((group) => sum(group.balances.youOwe)));
  const net = paisa(netOf(book.overall) + across((group) => netOf(group.balances)));
  const lines = balanceLines(book);

  const headline = settled(net) ? "Overall you are settled up." : net > 0 ? `Overall you are owed ${formatNpr(net)}.` : `Overall you owe ${formatNpr(-net)}.`;
  return {
    data: {
      net,
      youAreOwed,
      youOwe,
      lines,
      friends: friendBalances(book).filter((friend) => !settled(friend.net)),
      groups: groupViews(book).filter((group) => group.balances.length),
      simplest: book.overall.simplified.map((debt) => ({
        from: debt.fromId === book.self.id ? "You" : debt.fromName,
        to: debt.toId === book.self.id ? "You" : debt.toName,
        amount: debt.amount,
      })),
    },
    message: `${headline}${lines.length ? ` ${lines.join(". ")}.` : ""}`,
  };
}