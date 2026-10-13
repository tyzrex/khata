import { z } from "zod";
import { SHARED_CATEGORIES, TX_TYPES } from "@/lib/constants";
import { dateSchema, MAX_AMOUNT, moneySchema } from "@/lib/schemas";
import { SPLIT_MODES } from "@/lib/split";
import { parseAmount, resolveDate } from "@/server/agent/match";
import { AGENT_SCOPES, DEFAULT_AGENT_SCOPES } from "@/lib/agent-permissions";

/**
 * Request shapes for the /api/v1 agent API. They are forgiving about how values
 * are written (amount strings, "yesterday", a comma list of names) and strict
 * about what they mean, so a model's small formatting slips still land.
 */

const amount = z.preprocess(
  (value) => {
    const parsed = parseAmount(value);
    return Number.isNaN(parsed) ? value : parsed;
  },
  z.number({ error: 'Amount must be a positive number, like 1200 or "1,200".' }).pipe(moneySchema),
);

const date = (today: string) => z.preprocess((value) => resolveDate(value, today), dateSchema);

const lower = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : value);
const upper = (value: unknown) => (typeof value === "string" ? value.trim().toUpperCase() : value);

/** The currency an amount is written in. Left out, it means NPR — the stored value. */
const currency = z.preprocess(upper, z.string({ error: "Currency must be a three-letter code like NPR or USD." }).regex(/^[A-Z]{3}$/, "Currency must be a three-letter code like NPR or USD."));

/** NPR per one unit of `currency`. Only meaningful next to a `foreignAmount`. */
const fxRate = z.preprocess(
  (value) => {
    if (value == null || value === "") return undefined;
    const parsed = parseAmount(value);
    return Number.isNaN(parsed) ? value : parsed;
  },
  z.number({ error: "Rate must be a positive number, like 134 or 1.5." }).positive("Rate must be greater than zero").max(1_000_000, "Rate is too large").optional(),
);

const name = z.string().trim().min(1).max(80);
const note = z.string().max(500).optional().default("");
const externalId = z.string().trim().min(1).max(200);

/** ["Sameer", "Anita"], "Sameer, Anita" and "Sameer and Anita" all become a list. */
const nameList = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value
          .split(/,|\band\b|&/i)
          .map((part) => part.trim())
          .filter(Boolean)
      : value,
  z.array(name).max(40),
);

const txType = z.preprocess(lower, z.enum(TX_TYPES, { error: "type must be expense, income, or transfer." }));

export function transactionInput(today: string) {
  return z
    .object({
      amount: amount.optional(),
      type: txType.optional().default("expense"),
      merchant: z.string().trim().min(1).max(160).optional(),
      description: z.string().trim().min(1).max(160).optional(),
      category: z.string().trim().max(80).optional(),
      account: z.string().trim().max(40).optional(),
      date: date(today),
      note,
      externalId: externalId.optional(),
      currency: currency.optional(),
      foreignAmount: amount.optional(),
      fxRate,
    })
    .refine((value) => value.merchant || value.description, { message: "Give a merchant or description, like \"Bhatbhateni\" or \"Lunch\".", path: ["merchant"] })
    .refine((value) => value.amount !== undefined || (value.currency !== undefined && value.currency !== "NPR" && value.foreignAmount !== undefined && value.fxRate !== undefined), {
      message: 'Send "amount" in NPR, or a "currency" with "foreignAmount" and "fxRate".',
      path: ["amount"],
    });
}

export type TransactionInput = z.infer<ReturnType<typeof transactionInput>>;

export function transactionPatch(today: string) {
  return z
    .object({
      amount: amount.optional(),
      type: txType.optional(),
      merchant: z.string().trim().min(1).max(160).optional(),
      description: z.string().trim().min(1).max(160).optional(),
      category: z.string().trim().max(80).optional(),
      account: z.string().trim().max(40).optional(),
      date: date(today).optional(),
      note: z.string().max(500).optional(),
      currency: currency.optional(),
      foreignAmount: amount.optional(),
      fxRate,
    })
    .refine((value) => Object.values(value).some((field) => field !== undefined), { message: "Nothing to change. Send at least one field." });
}

export const transactionQuery = z.object({
  q: z.string().trim().max(100).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  type: txType.optional(),
  category: z.string().trim().max(80).optional(),
  account: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
});

export const friendInput = z
  .object({ name: name.optional(), names: nameList.optional() })
  .refine((value) => value.name || value.names?.length, { message: 'Send "name" or "names".', path: ["name"] });

export const groupInput = z.object({
  name,
  members: nameList.optional().default([]),
  createMissing: z.boolean().optional().default(false),
});

export const groupPatch = z
  .object({
    name: name.optional(),
    addMembers: nameList.optional().default([]),
    removeMembers: nameList.optional().default([]),
    createMissing: z.boolean().optional().default(false),
  })
  .refine((value) => value.name || value.addMembers.length || value.removeMembers.length, { message: 'Send "name", "addMembers" or "removeMembers".' });

/** `split` as a list of { person, value } or as a { name: value } map. */
const splitEntries = z.preprocess(
  (value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value as Record<string, unknown>).map(([person, entry]) => ({ person, value: entry }))
      : value,
  z
    .array(
      z.object({
        person: name,
        value: z.preprocess((value) => (value == null ? undefined : Number.isNaN(parseAmount(value)) ? value : parseAmount(value)), z.number().finite().nonnegative().optional()),
      }),
    )
    .max(40),
);

export function expenseInput(today: string) {
  return z.object({
    description: z.string().trim().min(1, "description is required, like \"Dinner at Thakali\".").max(160),
    amount: amount.optional(),
    date: date(today),
    group: z.string().trim().max(100).nullable().optional(),
    paidBy: z.string().trim().max(80).nullable().optional(),
    splitWith: nameList.optional(),
    excludeMe: z.boolean().optional().default(false),
    splitMode: z.preprocess(lower, z.enum(SPLIT_MODES, { error: "splitMode must be equal, exact, shares, or percent." })).optional(),
    split: splitEntries.optional(),
    items: z.array(z.object({
      description: z.string().trim().min(1).max(160),
      amount,
      splitWith: nameList.optional(),
      splitMode: z.preprocess(lower, z.enum(SPLIT_MODES)).optional(),
      split: splitEntries.optional(),
    })).min(1).max(50).optional(),
    /** A retry key. Sending the same one again returns the first answer instead of adding a second expense. */
    externalId: externalId.optional(),
    /** One of the fixed shared categories. Omit it and the expense stays uncategorised. */
    category: z.preprocess(lower, z.enum(SHARED_CATEGORIES, { error: `category must be one of: ${SHARED_CATEGORIES.join(", ")}.` })).nullable().optional(),
    note,
  }).superRefine((value, ctx) => {
    const total = value.amount ?? (value.items ?? []).reduce((sum, item) => sum + item.amount, 0);
    if (total > MAX_AMOUNT) ctx.addIssue({ code: "custom", path: ["amount"], message: "Receipt total is too large." });
    if (value.amount === undefined && !value.items?.length) ctx.addIssue({ code: "custom", path: ["amount"], message: "Give an amount, or receipt items with their amounts." });
    if (value.items?.length && (value.split || value.splitWith || value.splitMode || value.excludeMe)) ctx.addIssue({ code: "custom", path: ["items"], message: "For an itemized expense, put splitWith, splitMode and split on each item, not on the overall expense." });
  }).transform((value) => ({ ...value, amount: value.amount ?? Math.round(value.items!.reduce((total, item) => total + Math.round(item.amount * 100), 0)) / 100 }));
}

export const expenseQuery = z.object({
  group: z.string().trim().max(100).optional(),
  with: z.string().trim().max(80).optional(),
  category: z.enum(SHARED_CATEGORIES).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export function settlementInput(today: string) {
  return z.object({
    from: z.string().trim().max(80).nullable().optional(),
    to: z.string().trim().max(80).nullable().optional(),
    amount,
    date: date(today),
    group: z.string().trim().max(100).nullable().optional(),
    /** A retry key. Sending the same one again returns the first answer instead of recording the payment twice. */
    externalId: externalId.optional(),
    note,
  });
}

export const keyInput = z.object({
  name: z.string().trim().min(1, "Give the key a name, like \"Grok bot\".").max(60),
  scopes: z.array(z.enum(AGENT_SCOPES)).min(1).max(3).refine((scopes) => scopes.includes("read"), "Every agent needs read access to resolve context.").optional().default(DEFAULT_AGENT_SCOPES),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional().default(null),
});
