import { z } from "zod";
import { dateSchema, issueMessage } from "@/lib/schemas";
import { SPLIT_MODES } from "@/lib/split";

const money = z.number().finite().positive("Amount must be greater than zero");

export const personWriteSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
});

export const groupWriteSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  memberIds: z.array(z.string().trim().min(1)).min(1, "Add at least one person").max(40),
});

export const groupPatchSchema = groupWriteSchema.partial().refine((value) => value.name !== undefined || value.memberIds !== undefined, {
  message: "Nothing to update",
});

export const expenseWriteSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(160),
  date: dateSchema,
  amount: money,
  paidById: z.string().trim().min(1),
  groupId: z.string().trim().min(1).nullable().optional(),
  splitMode: z.enum(SPLIT_MODES),
  note: z.string().max(500).optional().default(""),
  participants: z
    .array(
      z.object({
        personId: z.string().trim().min(1),
        amount: z.number().finite().nonnegative().optional(),
        weight: z.number().finite().positive().optional(),
      }),
    )
    .min(1)
    .max(40),
  transactionIds: z.array(z.string().trim().min(1)).max(20).optional().default([]),
});

export const settlementWriteSchema = z.object({
  fromPersonId: z.string().trim().min(1),
  toPersonId: z.string().trim().min(1),
  amount: money,
  date: dateSchema,
  groupId: z.string().trim().min(1).nullable().optional(),
  note: z.string().max(500).optional().default(""),
  transactionId: z.string().trim().min(1).nullable().optional(),
});

export function shareIssue(error: z.ZodError) {
  return issueMessage(error);
}
