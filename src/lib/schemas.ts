import { z } from "zod";
import { CATEGORY_KINDS, SHARED_CATEGORIES, TX_TYPES } from "@/lib/constants";
import { SPLIT_MODES } from "@/lib/split";

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
  // Accounts are per-person rows, so the shape is checked here and membership in the
  // book is settled by ensureNamedAccount, which adds the row if it is new.
  account: accountNameSchema,
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
  account: accountNameSchema,
  note: z.string().max(500).optional().default(""),
});

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

export const transactionDraftSchema = z
  .object({
    date: dateSchema,
    type: z.enum(TX_TYPES),
    amount: rupeesText,
    category: z.string().trim().min(1, "Pick a category").max(80),
    merchant: z.string().trim().min(1, "Add a merchant or description").max(160),
    account: accountNameSchema,
    note: z.string().trim().max(500, "Note is limited to 500 characters"),
  })
  .transform((draft) => ({ ...draft, amount: moneySchema.parse(Number(draft.amount)) }));

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
