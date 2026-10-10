import type { TransactionInput } from "@/lib/agent/schemas";
import { resolveAccount, resolveCategory } from "@/lib/agent/match";
import type { ManualTransaction } from "@/lib/schemas";

/** An agent's loose transaction turned into the exact row the ledger stores. */
export function toLedgerRow(input: TransactionInput, categoryNames: string[], accountNames: string[]): ManualTransaction & { externalId?: string } {
  return {
    date: input.date,
    type: input.type,
    amount: input.amount,
    currency: "NPR",
    category: resolveCategory(input.category, input.type, categoryNames),
    merchant: (input.merchant ?? input.description)!,
    account: resolveAccount(input.account, accountNames),
    note: input.note,
    externalId: input.externalId,
  };
}

/** `{ ... }`, `[ ... ]` or `{ "transactions": [ ... ] }` as a list, plus whether one row was sent bare. */
export function listOfRows(body: unknown): { rows: unknown[]; single: boolean } {
  if (Array.isArray(body)) return { rows: body, single: false };
  if (body && typeof body === "object" && "transactions" in body && Array.isArray(body.transactions)) return { rows: body.transactions, single: false };
  return { rows: [body], single: true };
}
