import { createHash } from "node:crypto";
import type { BalanceScope } from "@/db/shares";
import { formatNpr } from "@/lib/format";

type Debt = { person: string; amount: number };

export type OpenBalances = {
  title: string;
  detail: string;
  /** Signed net position: positive is owed to you, negative is owed by you. */
  amount: number;
  /** Identifies this exact set of open debts. See `describeOpenBalances`. */
  fingerprint: string;
};

function debtsFrom(scope: BalanceScope): { owe: Debt[]; owed: Debt[] } {
  return {
    owe: scope.youOwe.map((debt) => ({ person: debt.toName, amount: debt.amount })),
    owed: scope.youAreOwed.map((debt) => ({ person: debt.fromName, amount: debt.amount })),
  };
}

/** The same person can appear in several groups; one line per person reads better. */
function merge(debts: Debt[]): Debt[] {
  const totals = new Map<string, number>();
  for (const debt of debts) {
    // Sub-paisa remainders are what a split leaves behind; they are not a balance.
    if (debt.amount < 0.005) continue;
    totals.set(debt.person, (totals.get(debt.person) ?? 0) + debt.amount);
  }
  return [...totals.entries()].map(([person, amount]) => ({ person, amount })).sort((a, b) => b.amount - a.amount || a.person.localeCompare(b.person));
}

function total(debts: Debt[]): number {
  return debts.reduce((sum, debt) => sum + debt.amount, 0);
}

/**
 * The current set of open debts, folded into one summary.
 *
 * Open balances are a standing condition, not an event: nobody has to do anything for a
 * balance to still be open a month later. So this is derived from the share book rather
 * than fired from a write, and it carries a fingerprint of the exact set of open debts.
 * Two properties fall out of that fingerprint:
 *
 *   - Re-deriving is idempotent. The same open debts always produce the same
 *     fingerprint, so a repeated insert conflicts and nothing is written.
 *   - A change is announced once. Adding, settling, or resizing any balance produces a
 *     different fingerprint, so a fresh entry appears and the previous one is retired.
 *
 * Returns null when nothing is outstanding, which is the signal to stop nagging rather
 * than to post an all-clear.
 */
export function describeOpenBalances(input: { overall: BalanceScope; groups: BalanceScope[] }): OpenBalances | null {
  const all = [input.overall, ...input.groups].map(debtsFrom);
  const owe = merge(all.flatMap((entry) => entry.owe));
  const owed = merge(all.flatMap((entry) => entry.owed));
  if (!owe.length && !owed.length) return null;

  const oweTotal = total(owe);
  const owedTotal = total(owed);

  const parts: string[] = [];
  if (owe.length) parts.push(`You owe ${owe.map((debt) => debt.person).join(", ")} ${formatNpr(oweTotal)}`);
  if (owed.length) parts.push(`${owed.map((debt) => debt.person).join(", ")} owes you ${formatNpr(owedTotal)}`);

  const title = owe.length && owed.length ? "Balances are open both ways" : owe.length ? "You have balances to settle" : "Friends owe you money";

  // Amounts are quantised to paisa before hashing. Floating point noise in the last
  // bits would otherwise produce a different fingerprint for an unchanged balance and
  // re-notify about it on every poll.
  const signature = [...owe.map((debt) => `o:${debt.person}:${debt.amount.toFixed(2)}`), ...owed.map((debt) => `i:${debt.person}:${debt.amount.toFixed(2)}`)].join("|");

  return {
    title,
    detail: `${parts.join(" · ")}. Settle up from Balances.`,
    amount: owedTotal - oweTotal,
    fingerprint: createHash("sha256").update(signature).digest("hex").slice(0, 32),
  };
}
