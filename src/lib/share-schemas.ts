import { z } from "zod";
import { SHARED_CATEGORIES } from "@/lib/constants";
import { dateSchema, issueMessage, MAX_AMOUNT, moneySchema } from "@/lib/schemas";
import { SPLIT_MODES } from "@/lib/split";

const money = moneySchema;
const id = z.string().trim().min(1).max(100);

export const personWriteSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
});

export const groupWriteSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  memberIds: z.array(id).min(1, "Add at least one person").max(40),
});

export const groupPatchSchema = groupWriteSchema.partial().refine((value) => value.name !== undefined || value.memberIds !== undefined, {
  message: "Nothing to update",
});

export const expenseWriteSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(160),
  date: dateSchema,
  amount: money,
  paidById: id,
  groupId: id.nullable().optional(),
  splitMode: z.enum(SPLIT_MODES),
  /** Fixed shared vocabulary, not the owner's personal ledger categories. */
  category: z.enum(SHARED_CATEGORIES).nullish(),
  note: z.string().max(500).optional().default(""),
  participants: z
    .array(
      z.object({
        personId: id,
        amount: z.number().finite().nonnegative().max(MAX_AMOUNT).optional(),
        weight: z.number().finite().positive().max(1_000_000).optional(),
      }),
    )
    .min(1)
    .max(40),
  transactionIds: z.array(id).max(20).optional().default([]),
  version: z.number().int().positive().optional(),
});

export const settlementWriteSchema = z.object({
  fromPersonId: id,
  toPersonId: id,
  amount: money,
  date: dateSchema,
  groupId: id.nullable().optional(),
  note: z.string().max(500).optional().default(""),
  transactionId: id.nullable().optional(),
  version: z.number().int().positive().optional(),
});

export function shareIssue(error: z.ZodError) {
  return issueMessage(error);
}
