import { roundMoney } from "@/lib/money";
import { getShareBook } from "@/db/shares";
import { dashboardDebts } from "@/components/dashboard-shares";
import { friendBalances, netOf } from "@/server/agent/plan";
import { groupViews } from "@/server/agent/views";
import { formatNpr } from "@/lib/format";

/** Money only ever moves in paisa, so every total here is rounded back to 2dp. */
const paisa = roundMoney;

/** Below half a paisa a balance is not worth reporting. */
const settled = (amount: number) => Math.abs(amount) < 0.005;

export type BalanceView = {
  outstanding: ReturnType<typeof dashboardDebts>;
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
export async function balancesView(
  userId: string,
): Promise<Rendered<BalanceView>> {
  const book = await getShareBook(userId);
  const sum = (list: { amount: number }[]) =>
    list.reduce((total, debt) => total + debt.amount, 0);
  const across = (
    pick: (group: (typeof book.joinedGroups)[number]) => number,
  ) => book.joinedGroups.reduce((total, group) => total + pick(group), 0);

  const outstanding = dashboardDebts(book);
  const youAreOwed = paisa(sum(outstanding.filter((debt) => debt.incoming)));
  const youOwe = paisa(sum(outstanding.filter((debt) => !debt.incoming)));
  const net = paisa(
    netOf(book.overall) + across((group) => netOf(group.balances)),
  );
  const lines = outstanding.map(
    (debt) =>
      `${debt.incoming ? `${debt.name} owes you` : `You owe ${debt.name}`} ${formatNpr(debt.amount)} (${debt.context})`,
  );

  const headline = settled(net)
    ? outstanding.length
      ? "Your net balance is zero, but payments remain open in separate books."
      : "All balances are settled."
    : net > 0
      ? `Overall you are owed ${formatNpr(net)}.`
      : `Overall you owe ${formatNpr(-net)}.`;
  return {
    data: {
      outstanding,
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
