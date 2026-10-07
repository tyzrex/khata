export const ACCOUNTS = ["Nabil", "NIMB", "Sanima", "Splitwise", "Other"] as const;
export const TX_TYPES = ["expense", "income", "transfer"] as const;
export const CATEGORY_KINDS = ["expense", "income", "transfer", "any"] as const;

export type AccountName = (typeof ACCOUNTS)[number];
export type TxType = (typeof TX_TYPES)[number];
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const SWATCHES = [
  "#c45c16",
  "#8a3d55",
  "#2f5d50",
  "#1f6b45",
  "#3d5a80",
  "#5c4d7a",
  "#8a6a2f",
  "#6f675e",
] as const;

export const DEFAULT_CATEGORIES: {
  name: string;
  kind: CategoryKind;
  color: string;
  sortOrder: number;
}[] = [
  { name: "Food", kind: "expense", color: "#c45c16", sortOrder: 10 },
  { name: "Transport", kind: "expense", color: "#2f5d50", sortOrder: 20 },
  { name: "Parking", kind: "expense", color: "#6b5b4f", sortOrder: 30 },
  { name: "Entertainment", kind: "expense", color: "#8a3d55", sortOrder: 40 },
  { name: "Shopping", kind: "expense", color: "#3d5a80", sortOrder: 50 },
  { name: "Bills", kind: "expense", color: "#5c4d7a", sortOrder: 60 },
  { name: "Health", kind: "expense", color: "#1f6b45", sortOrder: 70 },
  { name: "Transfer", kind: "transfer", color: "#8a6a2f", sortOrder: 80 },
  { name: "Income", kind: "income", color: "#1f6b45", sortOrder: 90 },
  { name: "Other", kind: "any", color: "#6f675e", sortOrder: 100 },
];

export const KATHMANDU = "Asia/Kathmandu";
