import type { NextRequest } from "next/server";
import { listAccounts } from "@/db/accounts";
import { accountOf } from "@/db/agent";
import { listCategories, summarizeLedger } from "@/db/ledger";
import { getShareBook } from "@/db/shares";
import { balanceLines, friendBalances, netOf } from "@/lib/agent/plan";
import { agentError, ok } from "@/lib/agent/respond";
import { groupViews } from "@/lib/agent/views";
import { KATHMANDU, TX_TYPES } from "@/lib/constants";
import { requireAgentUserId } from "@/lib/session";
import { SPLIT_MODES } from "@/lib/split";

/** Everything an agent needs to resolve names and pick values, in one call. */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAgentUserId(request);
    const [account, book, categories, accounts, summary] = await Promise.all([
      accountOf(userId),
      getShareBook(userId),
      listCategories(userId),
      listAccounts(userId),
      summarizeLedger(userId),
    ]);
    const lines = balanceLines(book);
    const joinedNet = book.joinedGroups.reduce((total, group) => total + netOf(group.balances), 0);
    const net = Math.round((netOf(book.overall) + joinedNet) * 100) / 100;
    return ok(
      {
        me: { name: account.name, email: account.email, personId: book.self.id },
        today: summary.today,
        timezone: KATHMANDU,
        currency: "NPR",
        friends: friendBalances(book),
        groups: groupViews(book),
        categories: categories.map((category) => ({ name: category.name, kind: category.kind })),
        accounts: accounts.map((item) => item.name),
        transactionTypes: TX_TYPES,
        splitModes: SPLIT_MODES,
        balances: { net, lines },
        thisWeek: { start: summary.week.start, end: summary.week.end, spent: summary.week.spent, credited: summary.week.credits },
        thisMonth: { start: summary.month.start, end: summary.month.end, spent: summary.month.spent, credited: summary.month.credits },
      },
      `Khata for ${account.name || "you"}. Today is ${summary.today}. ${lines.length ? lines.join(". ") + "." : "All balances are settled."}`,
    );
  } catch (error) {
    return agentError(error);
  }
}
