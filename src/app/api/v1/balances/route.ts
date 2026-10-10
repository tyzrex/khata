import type { NextRequest } from "next/server";
import { getShareBook } from "@/db/shares";
import { balanceLines, friendBalances, netOf } from "@/lib/agent/plan";
import { agentError, ok } from "@/lib/agent/respond";
import { groupViews } from "@/lib/agent/views";
import { formatNpr } from "@/lib/format";
import { requireAgentUserId } from "@/lib/session";

/** Who owes whom: overall, per friend, per group, and the fewest payments that settle your own book. */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAgentUserId(request);
    const book = await getShareBook(userId);
    const lines = balanceLines(book);
    const sum = (list: { amount: number }[]) => list.reduce((total, debt) => total + debt.amount, 0);
    const youAreOwed = Math.round((sum(book.overall.youAreOwed) + book.joinedGroups.reduce((total, group) => total + sum(group.balances.youAreOwed), 0)) * 100) / 100;
    const youOwe = Math.round((sum(book.overall.youOwe) + book.joinedGroups.reduce((total, group) => total + sum(group.balances.youOwe), 0)) * 100) / 100;
    const net = Math.round((netOf(book.overall) + book.joinedGroups.reduce((total, group) => total + netOf(group.balances), 0)) * 100) / 100;
    const headline = Math.abs(net) < 0.005 ? "Overall you are settled up." : net > 0 ? `Overall you are owed ${formatNpr(net)}.` : `Overall you owe ${formatNpr(-net)}.`;
    return ok(
      {
        net,
        youAreOwed,
        youOwe,
        lines,
        friends: friendBalances(book).filter((friend) => Math.abs(friend.net) >= 0.005),
        groups: groupViews(book).filter((group) => group.balances.length),
        simplest: book.overall.simplified.map((debt) => ({ from: debt.fromId === book.self.id ? "You" : debt.fromName, to: debt.toId === book.self.id ? "You" : debt.toName, amount: debt.amount })),
      },
      `${headline}${lines.length ? ` ${lines.join(". ")}.` : ""}`,
    );
  } catch (error) {
    return agentError(error);
  }
}
