import {
  date,
  index,
  integer,
  numeric,
  pgTable,
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

export type CategoryRow = typeof categories.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
