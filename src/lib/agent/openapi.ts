import { TX_TYPES } from "@/lib/constants";
import { SPLIT_MODES } from "@/lib/split";

/**
 * OpenAPI 3.1 description of /api/v1. Tool importers (Grok, ChatGPT actions,
 * Claude, LangChain) read the `description` fields to decide when and how to
 * call each operation, so those are written as instructions to a model.
 */

const DATE = { type: "string", description: 'A date as YYYY-MM-DD, or "today", "yesterday", "tomorrow". Defaults to today in Asia/Kathmandu.', examples: ["2026-10-08", "yesterday"] };
const AMOUNT = {
  oneOf: [{ type: "number", exclusiveMinimum: 0 }, { type: "string" }],
  description: 'Amount in Nepalese rupees (NPR). A number, or a string like "1,200" or "Rs 450". Rounded to the paisa.',
  examples: [1200, "1,200.50"],
};
const NAMES = {
  oneOf: [{ type: "array", items: { type: "string" } }, { type: "string" }],
  description: 'People by name, as a list or a comma/"and" separated string. "me" means the caller. Names match case-insensitively; a unique first name is enough ("Sameer" for "Sameer Shrestha"). Ids from /context also work.',
  examples: [["Sameer", "Anita"], "Sameer and Anita"],
};
const ID = { type: "string", description: "Id returned by an earlier call." };

const envelope = (data: Record<string, unknown>, example?: string) => ({
  description: "Success. Read `message` to the user; use `data` for follow-up calls.",
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["ok", "message", "data"],
        properties: {
          ok: { const: true },
          message: { type: "string", description: "One or two plain sentences describing what happened, safe to relay verbatim.", ...(example ? { examples: [example] } : {}) },
          data,
        },
      },
    },
  },
});

const errors = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "401": { $ref: "#/components/responses/Unauthorized" },
  "429": { $ref: "#/components/responses/TooMany" },
};

const transactionSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    externalId: { type: ["string", "null"] },
    date: { type: "string" },
    type: { enum: TX_TYPES },
    amount: { type: "number", description: "The NPR value. Always NPR, whatever currency the entry was typed in." },
    currency: { type: "string", description: "The currency the entry was typed in; NPR for everything that is not foreign." },
    foreignAmount: { type: ["number", "null"], description: "What was typed, in `currency`; null for a plain NPR entry." },
    fxRate: { type: ["number", "null"], description: "NPR per one unit of `currency`; null for a plain NPR entry." },
    category: { type: "string" },
    merchant: { type: "string" },
    account: { type: "string" },
    note: { type: "string" },
    source: { type: "string" },
  },
};

const transactionInput = {
  type: "object",
  properties: {
    amount: { ...AMOUNT, description: "The NPR value. Omit it only when `currency`, `foreignAmount` and `fxRate` are sent together; the NPR amount is then computed from them." },
    currency: { type: "string", pattern: "^[A-Za-z]{3}$", description: "Three-letter code the amount was typed in, e.g. USD or AED. Defaults to NPR." },
    foreignAmount: { ...AMOUNT, description: "The amount in `currency`. Send it with `currency` and `fxRate` instead of `amount`." },
    fxRate: { type: "number", exclusiveMinimum: 0, description: "NPR per one unit of `currency`, e.g. 134.25 for a dollar." },
    type: { enum: TX_TYPES, default: "expense", description: "expense = money out (counts as spent). income = money in. transfer = moving money between your own accounts or a friend paying you back." },
    merchant: { type: "string", maxLength: 160, description: "Who was paid or what it was, e.g. \"Bhatbhateni\". Either merchant or description is required." },
    description: { type: "string", maxLength: 160, description: "Used as the merchant when merchant is missing." },
    category: { type: "string", maxLength: 80, description: "Category name, e.g. Food, Transport, Bills. Matches existing categories case-insensitively; an unknown name creates a new category. Defaults to Other (Income / Transfer for those types)." },
    account: { type: "string", maxLength: 40, description: "Bank, wallet or cash. Matches one of the caller's accounts from /context case-insensitively, and a partial like \"Nabil Bank\" works. An unknown name is rejected; omit it to use the first account." },
    date: DATE,
    note: { type: "string", maxLength: 500 },
    externalId: { type: "string", maxLength: 200, description: "Optional stable id from the source (an SMS or email id). Sending the same externalId again updates that row instead of adding a duplicate. Use it whenever the source has one." },
  },
};

export function openApiSpec(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Khata API",
      version: "1.0.0",
      description: [
        "Khata is a personal NPR ledger plus a Splitwise-style share book. This API lets an assistant act for one Khata user.",
        "",
        "How to use it well:",
        "1. Call getContext first. It returns the user's friends, groups, categories and accounts, so you can use the right names.",
        "2. Refer to people and groups by name. \"me\" is the user. If a name is ambiguous or unknown, the error lists `candidates`: ask the user which one they meant, do not guess.",
        "3. Personal spending (\"I paid 450 for lunch\") is a transaction. Money shared with friends (\"split dinner 1200 with Sameer\") is an expense. A friend paying back is a settlement.",
        "4. Every response has `message`, a sentence you can read back to the user.",
        "",
        "All amounts are Nepalese rupees (NPR). Dates are YYYY-MM-DD in Asia/Kathmandu.",
      ].join("\n"),
    },
    servers: [{ url: `${origin}/api/v1` }],
    security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
    tags: [
      { name: "Context", description: "Names and defaults to resolve before writing." },
      { name: "Ledger", description: "The user's own bank and cash transactions." },
      { name: "Splits", description: "Friends, groups, shared expenses, balances and settlements." },
    ],
    paths: {
      "/context": {
        get: {
          operationId: "getContext",
          tags: ["Context"],
          summary: "Everything needed to resolve names, in one call",
          description: "Returns the user (me), today's date, friends with balances, groups with members, categories, accounts, this week's and this month's totals, and plain-language balance lines. Call this before writing so names match.",
          responses: { "200": envelope({ type: "object" }, "Khata for Sulav. Today is 2026-10-08. Sameer owes you NPR 1,425."), ...errors },
        },
      },
      "/transactions": {
        get: {
          operationId: "listTransactions",
          tags: ["Ledger"],
          summary: "Search the personal ledger",
          description: "Lists transactions newest first with totals. Use from/to for a period (\"how much did I spend on food this month\" → category=Food, from=first of month, to=today, read totals.spent).",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" }, description: "Text search over merchant, note, account and category." },
            { name: "account", in: "query", schema: { type: "string" }, description: "Only entries in one of the caller's accounts, matched case-insensitively." },
            { name: "from", in: "query", schema: { type: "string", format: "date" }, description: "First date, inclusive (YYYY-MM-DD)." },
            { name: "to", in: "query", schema: { type: "string", format: "date" }, description: "Last date, inclusive (YYYY-MM-DD)." },
            { name: "type", in: "query", schema: { enum: TX_TYPES } },
            { name: "category", in: "query", schema: { type: "string" }, description: "Exact category name." },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 50 } },
          ],
          responses: {
            "200": envelope({
              type: "object",
              properties: {
                transactions: { type: "array", items: transactionSchema },
                totals: { type: "object", properties: { count: { type: "integer" }, spent: { type: "number", description: "Sum of expenses over all matches, not just the returned page." }, credited: { type: "number", description: "Income plus transfers." } } },
                truncated: { type: "boolean" },
              },
            }),
            ...errors,
          },
        },
        post: {
          operationId: "addTransactions",
          tags: ["Ledger"],
          summary: "Add one or more personal transactions",
          description: "Records money the user spent or received in their own ledger. Send one object, an array, or { transactions: [...] } (up to 100). This does not involve friends; for a shared bill use addExpense.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { oneOf: [transactionInput, { type: "array", items: transactionInput }, { type: "object", properties: { transactions: { type: "array", items: transactionInput } } }] },
                examples: {
                  lunch: { value: { amount: 450, merchant: "Bajeko Sekuwa", category: "Food", account: "Nabil" } },
                  salary: { value: { amount: "85,000", type: "income", merchant: "Salary", account: "NIMB", date: "2026-10-01" } },
                  subscription: { value: { currency: "USD", foreignAmount: 20, fxRate: 134.25, merchant: "Figma", category: "Bills", account: "Nabil" } },
                },
              },
            },
          },
          responses: {
            "201": envelope(
              { type: "object", properties: { transactions: { type: "array", items: transactionSchema }, created: { type: "integer" }, updated: { type: "integer" }, invalid: { type: "array", items: { type: "object", properties: { index: { type: "integer" }, error: { type: "string" } } } } } },
              "Saved: Spent NPR 450 — Bajeko Sekuwa (Food, Nabil) on 2026-10-08.",
            ),
            ...errors,
          },
        },
      },
      "/transactions/{id}": {
        parameters: [{ name: "id", in: "path", required: true, schema: ID }],
        get: { operationId: "getTransaction", tags: ["Ledger"], summary: "One transaction", responses: { "200": envelope({ type: "object", properties: { transaction: transactionSchema } }), "404": { $ref: "#/components/responses/NotFound" }, ...errors } },
        patch: {
          operationId: "updateTransaction",
          tags: ["Ledger"],
          summary: "Change some fields of a transaction",
          description: "Only the fields sent change. Find the id with listTransactions first.",
          requestBody: { required: true, content: { "application/json": { schema: { ...transactionInput, required: [] } } } },
          responses: { "200": envelope({ type: "object", properties: { transaction: transactionSchema } }), "404": { $ref: "#/components/responses/NotFound" }, ...errors },
        },
        delete: {
          operationId: "deleteTransaction",
          tags: ["Ledger"],
          summary: "Delete a transaction",
          description: "Permanent. Confirm with the user before calling.",
          responses: { "200": envelope({ type: "object", properties: { id: { type: "string" } } }), "404": { $ref: "#/components/responses/NotFound" }, ...errors },
        },
      },
      "/friends": {
        get: {
          operationId: "listFriends",
          tags: ["Splits"],
          summary: "Friends with your balance with each",
          description: "net > 0: they owe the user. net < 0: the user owes them. `summary` is a ready sentence.",
          responses: { "200": envelope({ type: "object", properties: { friends: { type: "array", items: { $ref: "#/components/schemas/FriendBalance" } } } }), ...errors },
        },
        post: {
          operationId: "addFriends",
          tags: ["Splits"],
          summary: "Add friends by name",
          description: "Creates friends. A name that already exists is returned unchanged, so this is safe to retry.",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, names: NAMES } }, examples: { one: { value: { name: "Sameer" } }, many: { value: { names: ["Anita", "Rajan"] } } } } } },
          responses: { "201": envelope({ type: "object" }, "Added Anita, Rajan."), ...errors },
        },
      },
      "/groups": {
        get: {
          operationId: "listGroups",
          tags: ["Splits"],
          summary: "Groups with members and balances",
          description: "Includes groups the user owns and groups other people invited them to (owned: false).",
          responses: { "200": envelope({ type: "object", properties: { groups: { type: "array", items: { $ref: "#/components/schemas/Group" } } } }), ...errors },
        },
        post: {
          operationId: "createGroup",
          tags: ["Splits"],
          summary: "Create a group",
          description: "The user is always a member. Members must already be friends unless createMissing is true, which adds unknown names as new friends. Without it, an unknown name returns an error with close matches: ask the user before retrying with createMissing.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", required: ["name"], properties: { name: { type: "string", maxLength: 80 }, members: NAMES, createMissing: { type: "boolean", default: false } } },
                examples: { trip: { value: { name: "Pokhara trip", members: ["Sameer", "Anita"], createMissing: true } } },
              },
            },
          },
          responses: { "201": envelope({ type: "object", properties: { group: { $ref: "#/components/schemas/Group" } } }, 'Created "Pokhara trip" with You, Anita, Sameer.'), "409": { $ref: "#/components/responses/Conflict" }, ...errors },
        },
      },
      "/groups/{group}": {
        parameters: [{ name: "group", in: "path", required: true, schema: { type: "string" }, description: "Group id or name (URL-encoded)." }],
        get: {
          operationId: "getGroup",
          tags: ["Splits"],
          summary: "One group with balances and recent expenses",
          responses: { "200": envelope({ type: "object", properties: { group: { $ref: "#/components/schemas/Group" }, recentExpenses: { type: "array", items: { $ref: "#/components/schemas/Expense" } } } }), "404": { $ref: "#/components/responses/NotFound" }, ...errors },
        },
        patch: {
          operationId: "updateGroup",
          tags: ["Splits"],
          summary: "Rename a group or add and remove members",
          description: "Only for groups the user owns. Removing a member keeps their past expenses.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", properties: { name: { type: "string" }, addMembers: NAMES, removeMembers: NAMES, createMissing: { type: "boolean", default: false } } },
                examples: { add: { value: { addMembers: ["Rajan"] } } },
              },
            },
          },
          responses: { "200": envelope({ type: "object", properties: { group: { $ref: "#/components/schemas/Group" } } }), "403": { $ref: "#/components/responses/Forbidden" }, ...errors },
        },
      },
      "/expenses": {
        get: {
          operationId: "listExpenses",
          tags: ["Splits"],
          summary: "Shared expenses, newest first",
          parameters: [
            { name: "group", in: "query", schema: { type: "string" }, description: "Group name or id." },
            { name: "with", in: "query", schema: { type: "string" }, description: "Only expenses this person shares." },
            { name: "from", in: "query", schema: { type: "string", format: "date" } },
            { name: "to", in: "query", schema: { type: "string", format: "date" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
          ],
          responses: { "200": envelope({ type: "object", properties: { expenses: { type: "array", items: { $ref: "#/components/schemas/Expense" } } } }), ...errors },
        },
        post: {
          operationId: "addExpense",
          tags: ["Splits"],
          summary: "Split a bill with friends or a group",
          description: [
            "Records a shared expense and updates who owes whom. It does not add a ledger transaction; if the user also wants their own spending tracked, call addTransactions too.",
            "",
            "Who shares the cost:",
            "- With `group` and no `splitWith`: every member of the group, split equally.",
            "- With `splitWith`: those people, plus the user and the payer, split equally.",
            "- `excludeMe: true` leaves the user out of the cost. If the user paid, the others owe the whole amount (\"I paid 500 for Anita\" → paidBy me, splitWith [Anita], excludeMe true).",
            "- For unequal splits send `split` with one entry per person and set `splitMode`: exact (amounts that add up to the total), percent (adds up to 100) or shares (weights like 2 and 1). Only the people in `split` take part; the payer is added with a zero share if missing.",
            "",
            "Without `group`, a split with one friend goes to your direct book with them; with several friends it is recorded outside any group. Names that only exist in a group another user owns pick that group automatically.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["description", "amount"],
                  properties: {
                    description: { type: "string", maxLength: 160, description: "What it was for, e.g. \"Dinner at Thakali\"." },
                    amount: AMOUNT,
                    date: DATE,
                    group: { type: "string", description: "Group name or id. Optional." },
                    paidBy: { type: "string", default: "me", description: "Who paid. Defaults to the user." },
                    splitWith: NAMES,
                    excludeMe: { type: "boolean", default: false },
                    splitMode: { enum: SPLIT_MODES, default: "equal" },
                    split: {
                      oneOf: [
                        { type: "array", items: { type: "object", required: ["person"], properties: { person: { type: "string" }, value: { type: "number", description: "Amount, percent or share count, depending on splitMode." } } } },
                        { type: "object", additionalProperties: { type: "number" }, description: 'Map of name → value, e.g. { "me": 600, "Anita": 300 }.' },
                      ],
                    },
                    note: { type: "string", maxLength: 500 },
                  },
                },
                examples: {
                  equalWithFriends: { summary: "I paid, split equally with two friends", value: { description: "Dinner", amount: 1200, splitWith: ["Sameer", "Anita"] } },
                  wholeGroup: { summary: "Whole group, someone else paid", value: { description: "Fuel", amount: 3000, group: "Biker Gang", paidBy: "Rajan" } },
                  paidForFriend: { summary: "I covered a friend completely", value: { description: "Movie ticket", amount: 500, splitWith: "Anita", excludeMe: true } },
                  exact: { summary: "Unequal amounts", value: { description: "Groceries", amount: 900, splitMode: "exact", split: { me: 600, Anita: 300 } } },
                },
              },
            },
          },
          responses: {
            "201": envelope(
              { type: "object", properties: { id: { type: "string" }, groupId: { type: ["string", "null"] }, shares: { type: "array", items: { type: "object", properties: { name: { type: "string" }, amount: { type: "number" } } } } } },
              'Added "Dinner" NPR 1,200 outside any group, paid by you. Split equally: Sameer NPR 400, Anita NPR 400, you NPR 400.',
            ),
            ...errors,
          },
        },
      },
      "/expenses/{id}": {
        parameters: [{ name: "id", in: "path", required: true, schema: ID }],
        get: { operationId: "getExpense", tags: ["Splits"], summary: "One shared expense", responses: { "200": envelope({ type: "object", properties: { expense: { $ref: "#/components/schemas/Expense" } } }), "404": { $ref: "#/components/responses/NotFound" }, ...errors } },
        delete: {
          operationId: "deleteExpense",
          tags: ["Splits"],
          summary: "Delete a shared expense",
          description: "Permanent, and changes everyone's balances. Confirm with the user first.",
          responses: { "200": envelope({ type: "object" }), "404": { $ref: "#/components/responses/NotFound" }, ...errors },
        },
      },
      "/settlements": {
        post: {
          operationId: "recordPayment",
          tags: ["Splits"],
          summary: "Record that someone paid someone back",
          description: "Settles some or all of a balance (\"Sameer paid me 500\" → from Sameer; \"I paid Anita 2000\" → to Anita). Either side defaults to the user. Without `group`, it is recorded in the group where that debt is open; if it is open in several, the error asks for a group.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", required: ["amount"], properties: { from: { type: "string", default: "me", description: "Who paid." }, to: { type: "string", default: "me", description: "Who received." }, amount: AMOUNT, date: DATE, group: { type: "string" }, note: { type: "string" } } },
                examples: { paidMe: { value: { from: "Sameer", amount: 1425 } }, iPaid: { value: { to: "Anita", amount: "2,000" } } },
              },
            },
          },
          responses: { "201": envelope({ type: "object" }, "Recorded: Sameer paid you NPR 1,425."), ...errors },
        },
      },
      "/settlements/{id}": {
        parameters: [{ name: "id", in: "path", required: true, schema: ID }],
        delete: { operationId: "deletePayment", tags: ["Splits"], summary: "Remove a recorded payment", responses: { "200": envelope({ type: "object" }), "404": { $ref: "#/components/responses/NotFound" }, ...errors } },
      },
      "/balances": {
        get: {
          operationId: "getBalances",
          tags: ["Splits"],
          summary: "Who owes whom",
          description: "Overall net (positive = the user is owed), per-friend and per-group balances, plain sentences in `lines`, and `simplest`: the fewest payments that settle the user's own book.",
          responses: { "200": envelope({ type: "object" }, "Overall you are owed NPR 1,725. Sameer owes you NPR 1,425. You owe Anita NPR 2,000."), ...errors },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "A personal API key (khata_...) from Khata → Settings → API keys." },
        apiKeyHeader: { type: "apiKey", in: "header", name: "X-API-Key", description: "The same key in a header, for clients that cannot send Authorization." },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["ok", "error"],
          properties: {
            ok: { const: false },
            error: { type: "string", description: "What went wrong and how to fix it. Safe to show the user." },
            candidates: { type: "array", items: { type: "string" }, description: "Close or valid names. Ask the user to pick one, then retry with it." },
            hint: { type: "string" },
          },
        },
        FriendBalance: {
          type: "object",
          properties: { id: { type: "string" }, name: { type: "string" }, onKhata: { type: "boolean" }, net: { type: "number", description: "Positive: they owe the user." }, summary: { type: "string" } },
        },
        Group: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            owned: { type: "boolean" },
            owner: { type: ["string", "null"] },
            members: { type: "array", items: { type: "string" } },
            net: { type: "number" },
            summary: { type: "string" },
            balances: { type: "array", items: { type: "string" } },
            totalSpent: { type: "number" },
            expenseCount: { type: "integer" },
          },
        },
        Expense: {
          type: "object",
          properties: {
            id: { type: "string" },
            date: { type: "string" },
            description: { type: "string" },
            amount: { type: "number" },
            group: { type: ["string", "null"] },
            paidBy: { type: "string" },
            splitMode: { enum: SPLIT_MODES },
            shares: { type: "array", items: { type: "object", properties: { name: { type: "string" }, amount: { type: "number" } } } },
            yourShare: { type: "number" },
            summary: { type: "string" },
          },
        },
      },
      responses: {
        BadRequest: { description: "The request needs fixing. `error` says how; `candidates` lists names to choose from.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        Unauthorized: { description: "Missing, unknown or revoked API key.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        Forbidden: { description: "Only the group's owner can do that.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        NotFound: { description: "No such id for this user.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        Conflict: { description: "Already exists.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        TooMany: { description: "Rate limited. Wait `Retry-After` seconds.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  };
}

/** The short endpoint list shared by GET /api/v1 and llms.txt. */
export const ENDPOINTS = [
  ["GET", "/context", "Me, friends, groups, categories, accounts, today's date and balances. Call first."],
  ["GET", "/transactions", "Search the personal ledger with totals (q, from, to, type, category, limit)."],
  ["POST", "/transactions", "Add personal transactions (one, an array, or { transactions }). externalId makes it idempotent."],
  ["GET", "/transactions/{id}", "One transaction."],
  ["PATCH", "/transactions/{id}", "Change some fields of a transaction."],
  ["DELETE", "/transactions/{id}", "Delete a transaction."],
  ["GET", "/friends", "Friends with your net balance with each."],
  ["POST", "/friends", "Add friends by name (safe to retry)."],
  ["GET", "/groups", "Groups with members and balances."],
  ["POST", "/groups", "Create a group with member names (createMissing adds new friends)."],
  ["GET", "/groups/{group}", "One group by id or name, with recent expenses."],
  ["PATCH", "/groups/{group}", "Rename, addMembers, removeMembers."],
  ["GET", "/expenses", "Shared expenses (group, with, from, to, limit)."],
  ["POST", "/expenses", "Split a bill by names: equal, exact, percent or shares."],
  ["GET", "/expenses/{id}", "One shared expense with its split."],
  ["DELETE", "/expenses/{id}", "Delete a shared expense."],
  ["POST", "/settlements", "Record a payment between two people."],
  ["DELETE", "/settlements/{id}", "Remove a recorded payment."],
  ["GET", "/balances", "Who owes whom, with ready-to-read sentences."],
] as const;
