import type { TransactionInput } from "@/server/agent/schemas";
import { resolveAccount, resolveCategory, AgentInputError } from "@/server/agent/match";
import { issueMessage, manualTransactionSchema, type ManualTransaction } from "@/lib/schemas";

/**
 * An agent's loose transaction turned into the exact row the ledger stores.
 *
 * The candidate is run back through `manualTransactionSchema` rather than trusted
 * as-is: that schema owns what an amount means (NPR by default, converted from a
 * foreign currency otherwise), and the agent API has to obey the same rule as the
 * dialog. A row that fails is reported to the caller instead of reaching an insert.
 */
export function toLedgerRow(input: TransactionInput, categoryNames: string[], accountNames: string[]): ManualTransaction & { externalId?: string } {
  const candidate = {
    date: input.date,
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    foreignAmount: input.foreignAmount,
    fxRate: input.fxRate,
    category: resolveCategory(input.category, input.type, categoryNames),
    merchant: (input.merchant ?? input.description)!,
    account: resolveAccount(input.account, accountNames),
    note: input.note,
  };
  const parsed = manualTransactionSchema.safeParse(candidate);
  if (!parsed.success) throw new AgentInputError(issueMessage(parsed.error));
  return { ...parsed.data, externalId: input.externalId };
}

/** `{ ... }`, `[ ... ]` or `{ "transactions": [ ... ] }` as a list, plus whether one row was sent bare. */
export function listOfRows(body: unknown): { rows: unknown[]; single: boolean } {
  if (Array.isArray(body)) return { rows: body, single: false };
  if (body && typeof body === "object" && "transactions" in body && Array.isArray(body.transactions)) return { rows: body.transactions, single: false };
  return { rows: [body], single: true };
}
