import { roundMoney } from "@/lib/money";
import { z } from "zod";
import { CATEGORY_KINDS, SHARED_CATEGORIES, TX_TYPES } from "@/lib/constants";
import { SPLIT_MODES } from "@/lib/split";
import { plainIssue } from "@/server/validation";

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

/** Where money moves through. Free text, because each person names their own accounts. */
export const accountNameSchema = z.string().trim().min(1, "Pick an account").max(40, "Account name is limited to 40 characters");

/** Positive money in NPR, rounded to the paisa so what is stored is what was validated. */
export const moneySchema = z
  .number()
  .finite()
  .positive("Amount must be greater than zero")
  .max(MAX_AMOUNT, "Amount is too large")
  .transform((value) => roundMoney(value))
  .refine((value) => value > 0, "Amount must be at least 0.01");

const amountSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}, moneySchema);

/**
 * A currency code. NPR is the default and the only one totals ever see; any other
 * three-letter code is kept so the entry can show what it really was.
 */
const currencySchema = z.preprocess(
  (value) => (value == null || value === "" ? "NPR" : typeof value === "string" ? value.trim().toUpperCase() : value),
  z.string().regex(/^[A-Z]{3}$/, "Currency must be a three-letter code like NPR or USD"),
);

/** An optional number that a form or a JSON body may send as text, or as an empty string. */
const optionalNumber = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => {
    if (value == null || (typeof value === "string" && value.trim() === "")) return undefined;
    return typeof value === "string" ? Number(value) : value;
  }, schema.optional());

/** NPR per one unit of a foreign currency. Six decimals, matching the column. */
const rateSchema = z
  .number()
  .finite()
  .positive("Rate must be greater than zero")
  .max(1_000_000, "Rate is too large")
  .transform((value) => Math.round(value * 1e6) / 1e6);

/**
 * The fields that make an amount foreign. Both are only meaningful together, and
 * both are refused when the currency is NPR — an NPR entry has nothing to convert.
 */
const currencyFields = {
  amount: amountSchema.optional(),
  currency: currencySchema,
  foreignAmount: optionalNumber(moneySchema),
  fxRate: optionalNumber(rateSchema),
};

type CurrencyInput = { currency: string; amount?: number; foreignAmount?: number; fxRate?: number };

/** Rejects a half-specified conversion before it reaches the database. */
function checkCurrency(value: CurrencyInput, ctx: z.RefinementCtx) {
  if (value.currency === "NPR") {
    if (value.amount === undefined) ctx.addIssue({ code: "custom", path: ["amount"], message: "Amount must be greater than zero" });
    return;
  }
  if (value.foreignAmount === undefined) ctx.addIssue({ code: "custom", path: ["foreignAmount"], message: `Enter the amount in ${value.currency}` });
  if (value.fxRate === undefined) ctx.addIssue({ code: "custom", path: ["fxRate"], message: `Enter the NPR rate for ${value.currency}` });
  if (value.foreignAmount === undefined || value.fxRate === undefined) return;
  const converted = roundMoney(value.foreignAmount * value.fxRate);
  if (converted > MAX_AMOUNT) ctx.addIssue({ code: "custom", path: ["foreignAmount"], message: "That is too large once converted to NPR" });
  else if (converted < 0.01) ctx.addIssue({ code: "custom", path: ["foreignAmount"], message: "That rounds to less than a paisa" });
}

/**
 * The stored amount is always NPR, so a foreign entry converts here and nowhere
 * else. Deriving it instead of trusting a second number means the two can never
 * disagree, and every summary keeps reading `amount` exactly as it did before.
 */
function convertedAmount(value: CurrencyInput) {
  if (value.currency === "NPR") return { amount: value.amount as number, foreignAmount: null, fxRate: null };
  return {
    amount: roundMoney(value.foreignAmount! * value.fxRate!),
    foreignAmount: value.foreignAmount!,
    fxRate: value.fxRate!,
  };
}

export const importTransactionSchema = z
  .object({
    externalId: z.string().trim().min(1).max(200),
    date: dateSchema,
    type: z.enum(TX_TYPES),
    ...currencyFields,
    category: z.string().trim().min(1).max(80),
    merchant: z.string().trim().min(1).max(160),
    // Accounts are per-person rows, so the shape is checked here and membership in the
    // book is settled by ensureNamedAccount, which adds the row if it is new.
    account: accountNameSchema,
    note: z.string().max(500).optional().default(""),
    source: z.string().trim().min(1).max(40).optional().default("gmail"),
  })
  .superRefine(checkCurrency)
  .transform((value) => ({ ...value, ...convertedAmount(value) }));

export const manualTransactionSchema = z
  .object({
    date: dateSchema,
    type: z.enum(TX_TYPES),
    ...currencyFields,
    category: z.string().trim().min(1).max(80),
    merchant: z.string().trim().min(1).max(160),
    account: accountNameSchema,
    note: z.string().max(500).optional().default(""),
  })
  .superRefine(checkCurrency)
  .transform((value) => ({ ...value, ...convertedAmount(value) }));

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(40),
  kind: z.enum(CATEGORY_KINDS),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #0052ff"),
});

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Name the account").max(40, "Name is limited to 40 characters"),
});

export const accountRenameSchema = z.object({
  name: z.string().trim().min(1, "Name the account").max(40, "Name is limited to 40 characters"),
});

export const accountFormSchema = z.object({
  name: z.string().trim().min(1, "Name the account").max(40, "Name is limited to 40 characters"),
});

export type AccountFormValues = z.infer<typeof accountFormSchema>;

/**
 * Email and password auth. Sign-up also asks for a name, so the schema is built
 * per mode rather than carrying a `signing up` flag through the form values.
 */
export function authSchema(mode: "sign-in" | "sign-up") {
  const name = z.string().trim().max(80, "Name is too long");

  return z.object({
    name: mode === "sign-up" ? name.min(2, "Tell us your name") : name,
    email: z.email("Enter a valid email address"),
    password: z.string().min(8, "Use at least 8 characters").max(200, "Password is too long"),
  });
}

export type AuthValues = z.infer<ReturnType<typeof authSchema>>;

/*
 * Form schemas below describe what a dialog holds while you type, so the amount
 * is text (the inputs filter it as you go) and the message reads the way it should.
 * Where the API wants a number instead, the schema transforms on the way out.
 */

/** Rupees typed into a form. Reports one message at a time so the field never stacks three. */
const rupeesText = z.string().trim().superRefine((text, ctx) => {
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    ctx.addIssue({ code: "custom", message: "Use digits, like 450 or 450.50" });
    return;
  }
  const amount = Number(text);
  if (amount <= 0) ctx.addIssue({ code: "custom", message: "Amount must be greater than zero" });
  else if (amount > MAX_AMOUNT) ctx.addIssue({ code: "custom", message: "Amount is too large" });
});

/** The rate a form holds while you type. `""` means the entry is plain NPR. */
const rateText = z.string().trim().max(20);

export const transactionDraftSchema = z
  .object({
    date: dateSchema,
    type: z.enum(TX_TYPES),
    /** The currency the amount below was typed in. `NPR` unless the person changed it. */
    currency: z
      .string()
      .trim()
      .min(1)
      .max(3)
      .transform((value) => value.toUpperCase()),
    /** In `currency`, not in NPR — the NPR value is derived on save. */
    amount: rupeesText,
    /** NPR per one unit of `currency`. Empty for NPR, required otherwise. */
    fxRate: rateText,
    category: z.string().trim().min(1, "Pick a category").max(80),
    merchant: z.string().trim().min(1, "Add a merchant or description").max(160),
    account: accountNameSchema,
    note: z.string().trim().max(500, "Note is limited to 500 characters"),
  })
  .superRefine((draft, ctx) => {
    if (draft.currency === "NPR") return;
    if (!/^\d+(\.\d{1,6})?$/.test(draft.fxRate) || Number(draft.fxRate) <= 0) {
      ctx.addIssue({ code: "custom", path: ["fxRate"], message: "Enter the NPR rate, like 134.25" });
    }
  })
  .transform((draft) => {
    const entered = moneySchema.parse(Number(draft.amount));
    if (draft.currency === "NPR") return { ...draft, amount: entered, foreignAmount: null, fxRate: null };
    const fxRate = Math.round(Number(draft.fxRate) * 1e6) / 1e6;
    return { ...draft, amount: roundMoney(entered * fxRate), foreignAmount: entered, fxRate };
  });

export type TransactionDraft = z.input<typeof transactionDraftSchema>;
export type TransactionEntry = z.output<typeof transactionDraftSchema>;

export const splitParticipantSchema = z.object({
  personId: z.string().min(1),
  amount: z.number().nonnegative().optional(),
  weight: z.number().positive().optional(),
});

export const shareExpenseSchema = z.object({
  description: z.string().trim().min(1, "Say what it was for").max(160),
  amount: rupeesText.transform((text) => moneySchema.parse(Number(text))),
  date: dateSchema,
  paidById: z.string().min(1, "Say who paid"),
  groupId: z.string().min(1),
  splitMode: z.enum(SPLIT_MODES),
  /** `""` is the "no category" choice and maps to null on the wire. */
  category: z.union([z.literal(""), z.enum(SHARED_CATEGORIES)]),
  note: z.string().trim().max(500, "Note is limited to 500 characters"),
  participants: z.array(splitParticipantSchema).min(1, "Pick at least one person"),
  transactionIds: z.array(z.string()),
});

export type ShareExpenseValues = z.infer<typeof shareExpenseSchema>;

export const settleSchema = z
  .object({
    fromPersonId: z.string().min(1),
    toPersonId: z.string().min(1),
    amount: rupeesText,
    date: dateSchema,
    groupId: z.string().min(1),
    note: z.string().trim().max(500, "Note is limited to 500 characters"),
    transactionId: z.string().min(1),
  })
  .refine((values) => values.fromPersonId !== values.toPersonId, {
    path: ["toPersonId"],
    message: "Pick two different people",
  })
  .transform((values) => ({ ...values, amount: moneySchema.parse(Number(values.amount)) }));

export type SettleValues = z.infer<typeof settleSchema>;

export function inviteSchema(mode: "creating-group" | "not-creating-group") {
  const email = z.email("Enter a valid email address");

  return z.object({
    choice: z.string().min(1),
    newName: mode === "creating-group" ? z.string().trim().min(1, "Give the group a name").max(80, "Name is limited to 80 characters") : z.string(),
    email: z.union([z.literal(""), email]),
    pickedPerson: z.string().min(1),
  });
}

export type InviteValues = z.infer<ReturnType<typeof inviteSchema>>;

export const groupFormSchema = z.object({
  name: z.string().trim().min(1, "Give the group a name").max(80, "Name is limited to 80 characters"),
  memberIds: z.array(z.string()).min(1, "Pick at least one person"),
});

export type GroupFormValues = z.infer<typeof groupFormSchema>;

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Name the category").max(40, "Name is limited to 40 characters"),
  kind: z.enum(CATEGORY_KINDS),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a color"),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

export const apiKeySchema = z.object({
  name: z.string().trim().min(1, "Name the key").max(60, "Name is limited to 60 characters"),
});

export type ApiKeyValues = z.infer<typeof apiKeySchema>;

/** Query-string filters for the ledger list. Empty values mean "no filter". */
const optionalParam = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : typeof value === "string" ? value.trim() : value), schema.optional());

export const transactionFiltersSchema = z.object({
  q: optionalParam(z.string().max(100, "Search is limited to 100 characters")),
  from: optionalParam(dateSchema),
  to: optionalParam(dateSchema),
  type: optionalParam(z.enum(TX_TYPES, { error: "Type must be expense, income, or transfer." })),
  category: optionalParam(z.string().max(80)),
  account: optionalParam(z.string().max(40)),
});

export type ImportTransaction = z.infer<typeof importTransactionSchema>;
export type ManualTransaction = z.infer<typeof manualTransactionSchema>;

export function issueMessage(error: z.ZodError) {
  return plainIssue(error);
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
