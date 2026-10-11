export const ACCOUNTS = ["Nabil", "NIMB", "Sanima", "Splitwise", "Other"] as const;

/** Seeds the `accounts` table for a new book. Ordered the way people list them. */
export const DEFAULT_ACCOUNTS = ACCOUNTS.map((name, index) => ({ name, sortOrder: (index + 1) * 10 }));
export const TX_TYPES = ["expense", "income", "transfer"] as const;
export const CATEGORY_KINDS = ["expense", "income", "transfer", "any"] as const;

/**
 * Categories for shared expenses.
 *
 * Deliberately a fixed vocabulary rather than the owner's personal ledger
 * categories: a joined member can read every expense in the group, so reusing
 * the owner's private category list would leak what they spend on into a book
 * they are only part of. Seven fixed values cost almost nothing and keep the
 * shared book self-contained. `null` on a row means "not categorised yet".
 */
export const SHARED_CATEGORIES = ["Food", "Transport", "Stay", "Shopping", "Bills", "Entertainment", "Other"] as const;
export type SharedCategory = (typeof SHARED_CATEGORIES)[number];

export type AccountName = (typeof ACCOUNTS)[number];
export type TxType = (typeof TX_TYPES)[number];
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

// Data-viz palette tuned to the Coinbase system: Coinbase Blue leads, with the
// documented yellow accent and cool neutrals. Semantic green/red are kept for
// up/down amounts, so they are not used as category colors.
export const SWATCHES = [
  "#0052ff",
  "#f4b000",
  "#7b5cff",
  "#00a3c4",
  "#05b169",
  "#5b616e",
  "#7c828a",
  "#a8acb3",
] as const;

export const DEFAULT_CATEGORIES: {
  name: string;
  kind: CategoryKind;
  color: string;
  sortOrder: number;
}[] = [
  { name: "Food", kind: "expense", color: "#f4b000", sortOrder: 10 },
  { name: "Transport", kind: "expense", color: "#0052ff", sortOrder: 20 },
  { name: "Parking", kind: "expense", color: "#5b616e", sortOrder: 30 },
  { name: "Entertainment", kind: "expense", color: "#7b5cff", sortOrder: 40 },
  { name: "Shopping", kind: "expense", color: "#00a3c4", sortOrder: 50 },
  { name: "Bills", kind: "expense", color: "#3d7bff", sortOrder: 60 },
  { name: "Health", kind: "expense", color: "#05b169", sortOrder: 70 },
  { name: "Transfer", kind: "transfer", color: "#a8acb3", sortOrder: 80 },
  { name: "Income", kind: "income", color: "#05b169", sortOrder: 90 },
  { name: "Other", kind: "any", color: "#7c828a", sortOrder: 100 },
];

export const KATHMANDU = "Asia/Kathmandu";
