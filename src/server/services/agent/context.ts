import { accountOf } from "@/db/agent";
import { listAccounts } from "@/db/accounts";
import { summarizeLedger } from "@/db/ledger";
import { listCategories } from "@/db/categories";
import { getShareBook } from "@/db/shares";
import { balanceLines, friendBalances, netOf } from "@/server/agent/plan";
import { groupViews } from "@/server/agent/views";
import { KATHMANDU, TX_TYPES } from "@/lib/constants";
import { SPLIT_MODES } from "@/lib/split";
import type { Rendered } from "@/server/services/agent/balances";

/**
 * Everything an agent needs to resolve names and pick values, in one call.
 *
 * The five reads are independent, so they run together: an agent typically
 * opens a conversation with this endpoint, and paying for five sequential round
 * trips to Postgres would be most of the latency.
 */
export async function contextView(userId: string): Promise<Rendered<Record<string, unknown>>> {
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

  return {
    data: {
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
    message: `Khata for ${account.name || "you"}. Today is ${summary.today}. ${lines.length ? `${lines.join(". ")}.` : "All balances are settled."}`,
  };
}