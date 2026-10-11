import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "@/db/auth-schema";

export * from "@/db/auth-schema";

const ownerId = () => text("user_id").notNull().references(() => user.id, { onDelete: "cascade" });
const linkedUserId = () => text("linked_user_id").references(() => user.id, { onDelete: "set null" });

export const categories = pgTable(
  "categories",
  {
    id: text("id").primaryKey(),
    userId: ownerId(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    color: text("color").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("categories_user_name_unique").on(table.userId, table.name).nullsNotDistinct(),
    index("categories_user_idx").on(table.userId),
  ],
);

/**
 * Where money moves through: a bank, cash in hand, a wallet. Kept as rows so a
 * person can rename or drop one, but `transactions.account` stays denormalized
 * text like `categoryName` — rename cascades in `db/accounts.ts` and delete is
 * blocked while entries still point at it. Same trade the categories make.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: ownerId(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("accounts_user_name_unique").on(table.userId, table.name).nullsNotDistinct(),
    index("accounts_user_idx").on(table.userId),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: ownerId(),
    externalId: text("external_id"),
    date: date("date", { mode: "string" }).notNull(),
    type: text("type").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    /** The currency the amount was typed in. `amount` is always the NPR value. */
    currency: text("currency").notNull().default("NPR"),
    /** What was typed, in `currency`. Null when the entry is plain NPR. */
    foreignAmount: numeric("foreign_amount", { precision: 14, scale: 2, mode: "number" }),
    /** NPR per one unit of `currency`, as the person entered it. Null for NPR. */
    fxRate: numeric("fx_rate", { precision: 18, scale: 6, mode: "number" }),
    categoryName: text("category_name").notNull(),
    merchant: text("merchant").notNull(),
    account: text("account").notNull(),
    note: text("note").notNull().default(""),
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("transactions_user_external_unique").on(table.userId, table.externalId).nullsNotDistinct(),
    index("transactions_user_idx").on(table.userId),
    index("transactions_date_idx").on(table.date),
    index("transactions_type_idx").on(table.type),
    index("transactions_category_idx").on(table.categoryName),
    index("transactions_account_idx").on(table.userId, table.account),
  ],
);

export const people = pgTable(
  "people",
  {
    id: text("id").primaryKey(),
    userId: ownerId(),
    name: text("name").notNull(),
    isSelf: boolean("is_self").notNull().default(false),
    linkedUserId: linkedUserId(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("people_user_idx").on(table.userId), index("people_linked_user_idx").on(table.linkedUserId)],
);

export const groups = pgTable(
  "groups",
  {
    id: text("id").primaryKey(),
    userId: ownerId(),
    name: text("name").notNull(),
    /** "group" is a normal named group. "direct" is the hidden two-person book behind a friendship. */
    kind: text("kind").notNull().default("group"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("groups_user_idx").on(table.userId)],
);

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    personId: text("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.personId] })],
);

export const sharedExpenses = pgTable(
  "shared_expenses",
  {
    id: text("id").primaryKey(),
    userId: ownerId(),
    groupId: text("group_id").references(() => groups.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
    description: text("description").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    currency: text("currency").notNull().default("NPR"),
    paidById: text("paid_by_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    splitMode: text("split_mode").notNull(),
    /** One of `SHARED_CATEGORIES`, or null when the author did not pick one. */
    category: text("category"),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("shared_expenses_user_idx").on(table.userId),
    index("shared_expenses_date_idx").on(table.date),
    index("shared_expenses_group_idx").on(table.groupId),
  ],
);

export const sharedExpenseRevisions = pgTable(
  "shared_expense_revisions",
  {
    id: text("id").primaryKey(),
    // Intentionally not a foreign key: deleting an expense must not erase its audit history.
    expenseId: text("expense_id").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    groupId: text("group_id"),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot")
      .$type<{
        description: string;
        amount: number;
        date: string;
        paidByName: string;
        splitMode: string;
        note: string;
      }>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("shared_expense_revisions_action_check", sql`${table.action} in ('updated', 'deleted')`),
    index("shared_expense_revisions_expense_created_idx").on(table.expenseId, table.createdAt),
    index("shared_expense_revisions_owner_idx").on(table.ownerUserId),
    index("shared_expense_revisions_group_idx").on(table.groupId),
  ],
);

export const sharedSplits = pgTable(
  "shared_splits",
  {
    expenseId: text("expense_id")
      .notNull()
      .references(() => sharedExpenses.id, { onDelete: "cascade" }),
    personId: text("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    weight: numeric("weight", { precision: 14, scale: 4, mode: "number" }),
  },
  (table) => [primaryKey({ columns: [table.expenseId, table.personId] })],
);

export const expenseTransactions = pgTable(
  "expense_transactions",
  {
    expenseId: text("expense_id")
      .notNull()
      .references(() => sharedExpenses.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id")
      .notNull()
      .unique()
      .references(() => transactions.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.expenseId, table.transactionId] })],
);

export const settlements = pgTable(
  "settlements",
  {
    id: text("id").primaryKey(),
    userId: ownerId(),
    groupId: text("group_id").references(() => groups.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
    fromPersonId: text("from_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    toPersonId: text("to_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    currency: text("currency").notNull().default("NPR"),
    date: date("date", { mode: "string" }).notNull(),
    note: text("note").notNull().default(""),
    transactionId: text("transaction_id")
      .unique()
      .references(() => transactions.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("settlements_user_idx").on(table.userId), index("settlements_date_idx").on(table.date)],
);

export const groupInvites = pgTable(
  "group_invites",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    creatorUserId: text("creator_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    inviteeEmail: text("invitee_email"),
    personId: text("person_id").references(() => people.id, { onDelete: "set null" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: text("accepted_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("group_invites_group_idx").on(table.groupId), index("group_invites_token_idx").on(table.token)],
);

export const groupUserAccess = pgTable(
  "group_user_access",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.userId] }), index("group_user_access_user_idx").on(table.userId)],
);

/** Devices a person enabled for Web Push. One row per browser subscription; the endpoint moves between accounts when claimed. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    failureCount: integer("failure_count").notNull().default(0),
  },
  (table) => [index("push_subscriptions_user_idx").on(table.userId)],
);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  expenseActivity: boolean("expense_activity").notNull().default(true),
  settlementActivity: boolean("settlement_activity").notNull().default(true),
  showAmounts: boolean("show_amounts").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A durable record of something that happened to an account, for the in-app feed.
 *
 * Written for every recipient of a shared write regardless of whether Web Push is
 * configured: `sendSharedActivityPush` returns early when the VAPID keys are
 * missing, so gating these inserts on delivery would leave the feed empty on every
 * deployment that has not set them. `dedupeKey` is unique so a retried or replayed
 * fan-out cannot duplicate a row.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    url: text("url"),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }),
    /** `<userId>:<eventKey>`. The unique index is what makes every insert idempotent. */
    dedupeKey: text("dedupe_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("notifications_dedupe_key_uidx").on(table.dedupeKey),
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: ownerId(),
    name: text("name").notNull(),
    /** The first characters of the key, shown so a person can tell keys apart. */
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("api_keys_user_idx").on(table.userId)],
);

export type CategoryRow = typeof categories.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
