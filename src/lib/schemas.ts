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

/**
 * Largest amount any entry may hold. The columns are numeric(14, 2); this keeps far
 * inside that and inside the range where paisa arithmetic on doubles stays exact.
 */
export const MAX_AMOUNT = 9_999_999_999.99;

/** Positive money in NPR, rounded to the paisa so what is stored is what was validated. */
export const moneySchema = z
  .number()
  .finite()
  .positive("Amount must be greater than zero")
  .max(MAX_AMOUNT, "Amount is too large")
  .transform((value) => Math.round(value * 100) / 100)
  .refine((value) => value > 0, "Amount must be at least 0.01");

const amountSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}, moneySchema);

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
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #0052ff"),
});

/** Query-string filters for the ledger list. Empty values mean "no filter". */
const optionalParam = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : typeof value === "string" ? value.trim() : value), schema.optional());

export const transactionFiltersSchema = z.object({
  q: optionalParam(z.string().max(100, "Search is limited to 100 characters")),
  from: optionalParam(dateSchema),
  to: optionalParam(dateSchema),
  type: optionalParam(z.enum(TX_TYPES, { error: "Type must be expense, income, or transfer." })),
  category: optionalParam(z.string().max(80)),
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
