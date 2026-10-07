import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  kind: text("kind").notNull(),
  color: text("color").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    externalId: text("external_id").unique(),
    date: date("date", { mode: "string" }).notNull(),
    type: text("type").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    currency: text("currency").notNull().default("NPR"),
    categoryName: text("category_name").notNull(),
    merchant: text("merchant").notNull(),
    account: text("account").notNull(),
    note: text("note").notNull().default(""),
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("transactions_date_idx").on(table.date),
    index("transactions_type_idx").on(table.type),
    index("transactions_category_idx").on(table.categoryName),
  ],
);

export const people = pgTable("people", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isSelf: boolean("is_self").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    groupId: text("group_id").references(() => groups.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    currency: text("currency").notNull().default("NPR"),
    paidById: text("paid_by_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    splitMode: text("split_mode").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("shared_expenses_date_idx").on(table.date),
    index("shared_expenses_group_idx").on(table.groupId),
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
    groupId: text("group_id").references(() => groups.id, { onDelete: "set null" }),
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
  (table) => [index("settlements_date_idx").on(table.date)],
);

export type CategoryRow = typeof categories.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
