import { z } from "zod";
import { ACCOUNTS, CATEGORY_KINDS, TX_TYPES } from "@/lib/constants";

export class ImportShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportShapeError";
  }
}

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }, "Date is not a real calendar day");

const amountSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}, z.number().finite().positive("Amount must be greater than zero"));

const currencySchema = z.preprocess((value) => {
  if (value == null || value === "") return "NPR";
  return typeof value === "string" ? value.trim().toUpperCase() : value;
}, z.literal("NPR", { error: "Currency must be NPR" }));

export const importTransactionSchema = z.object({
  externalId: z.string().trim().min(1).max(200),
  date: dateSchema,
  type: z.enum(TX_TYPES),
  amount: amountSchema,
  currency: currencySchema,
  category: z.string().trim().min(1).max(80),
  merchant: z.string().trim().min(1).max(160),
  account: z.enum(ACCOUNTS),
  note: z.string().max(500).optional().default(""),
  source: z.string().trim().min(1).max(40).optional().default("gmail"),
});

export const manualTransactionSchema = z.object({
  date: dateSchema,
  type: z.enum(TX_TYPES),
  amount: amountSchema,
  currency: currencySchema,
  category: z.string().trim().min(1).max(80),
  merchant: z.string().trim().min(1).max(160),
  account: z.enum(ACCOUNTS),
  note: z.string().max(500).optional().default(""),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(40),
  kind: z.enum(CATEGORY_KINDS),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #c45c16"),
});

export type ImportTransaction = z.infer<typeof importTransactionSchema>;
export type ManualTransaction = z.infer<typeof manualTransactionSchema>;

export function issueMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid value";
}

export function parseImportPayload(payload: unknown) {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && "transactions" in payload && Array.isArray(payload.transactions)
      ? payload.transactions
      : null;

  if (!list) {
    throw new ImportShapeError('Send { "transactions": [ ... ] } or a bare array.');
  }
  if (list.length > 500) {
    throw new ImportShapeError("Import at most 500 transactions at a time.");
  }

  const rows: ImportTransaction[] = [];
  const invalid: { index: number; message: string }[] = [];
  list.forEach((item, index) => {
    const parsed = importTransactionSchema.safeParse(item);
    if (!parsed.success) {
      invalid.push({ index, message: issueMessage(parsed.error) });
      return;
    }
    rows.push(parsed.data);
  });
  return { rows, invalid };
}
