import { z } from "zod";
import { MAX_AMOUNT, moneySchema } from "@/lib/schemas";
import {
  SPLIT_MODES,
  ShareInputError,
  buildSplits,
  toPaisa,
} from "@/lib/split";

export const expenseItemsSchema = z
  .array(
    z.object({
      description: z.string().trim().min(1).max(160),
      amount: moneySchema,
      splitMode: z.enum(SPLIT_MODES),
      splits: z
        .array(
          z.object({
            personId: z.string().trim().min(1).max(100),
            amount: z.number().finite().nonnegative().max(MAX_AMOUNT),
            weight: z.number().finite().nonnegative().max(1_000_000).nullable(),
          }),
        )
        .min(1)
        .max(40),
    }),
  )
  .min(1)
  .max(50);

export type ExpenseItem = z.infer<typeof expenseItemsSchema>[number];

/** Item shares must agree with both the receipt total and every person's overall share. */
export function validateExpenseItems(
  items: ExpenseItem[],
  amount: number,
  splits: { personId: string; amount: number }[],
) {
  const totals = new Map<string, number>();
  let total = 0;
  for (const item of items) {
    const seen = new Set<string>();
    let itemTotal = 0;
    for (const share of item.splits) {
      if (seen.has(share.personId))
        throw new ShareInputError("A person appears twice on a receipt item.");
      seen.add(share.personId);
      const paisa = toPaisa(share.amount);
      if (!Number.isFinite(paisa) || paisa < 0)
        throw new ShareInputError("Receipt shares must be zero or more.");
      itemTotal += paisa;
      totals.set(share.personId, (totals.get(share.personId) ?? 0) + paisa);
    }
    if (itemTotal !== toPaisa(item.amount))
      throw new ShareInputError(
        `Shares for "${item.description}" do not add up to its amount.`,
      );
    const calculated = buildSplits({
      mode: item.splitMode,
      total: item.amount,
      paidById: item.splits[0]!.personId,
      participants: item.splits.map((share) => ({
        personId: share.personId,
        amount: share.amount,
        weight: share.weight ?? undefined,
      })),
    });
    if (
      calculated.some(
        (share, index) =>
          toPaisa(share.amount) !== toPaisa(item.splits[index]!.amount),
      )
    )
      throw new ShareInputError(
        `Shares for "${item.description}" do not match its split method.`,
      );
    total += itemTotal;
  }
  if (total !== toPaisa(amount))
    throw new ShareInputError(
      "Receipt items must add up to the expense total.",
    );
  const overall = new Map(
    splits.map((share) => [share.personId, toPaisa(share.amount)]),
  );
  for (const personId of new Set([...totals.keys(), ...overall.keys()])) {
    if ((totals.get(personId) ?? 0) !== (overall.get(personId) ?? 0))
      throw new ShareInputError(
        "Receipt items do not match the overall shares. Send updated items, or items: null to replace the receipt with a total-only split.",
      );
  }
}
