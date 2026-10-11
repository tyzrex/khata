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

/**
 * Currencies an entry may be recorded in.
 *
 * Every amount is still stored in NPR — that is the only thing totals, summaries
 * and splits ever see. This list is about the currency a person *typed*: a salary
 * that arrives in dollars, or a subscription charged abroad, should say what it
 * really was instead of a converted number nobody can check.
 *
 * Any other three-letter code is accepted too. The list only decides which codes
 * get a symbol and a friendly name in the picker.
 */
export const CURRENCIES = [
  { code: "NPR", symbol: "रू", name: "Nepalese rupee" },
  { code: "USD", symbol: "$", name: "US dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "Pound sterling" },
  { code: "AUD", symbol: "A$", name: "Australian dollar" },
  { code: "CAD", symbol: "C$", name: "Canadian dollar" },
  { code: "AED", symbol: "AED ", name: "UAE dirham" },
  { code: "QAR", symbol: "QAR ", name: "Qatari riyal" },
  { code: "SAR", symbol: "SAR ", name: "Saudi riyal" },
  { code: "MYR", symbol: "RM", name: "Malaysian ringgit" },
  { code: "KRW", symbol: "₩", name: "South Korean won" },
  { code: "JPY", symbol: "¥", name: "Japanese yen" },
  { code: "SGD", symbol: "S$", name: "Singapore dollar" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong dollar" },
  { code: "CNY", symbol: "CN¥", name: "Chinese yuan" },
  { code: "INR", symbol: "₹", name: "Indian rupee" },
  { code: "KWD", symbol: "KWD ", name: "Kuwaiti dinar" },
  { code: "BHD", symbol: "BHD ", name: "Bahraini dinar" },
  { code: "OMR", symbol: "OMR ", name: "Omani rial" },
  { code: "THB", symbol: "฿", name: "Thai baht" },
] as const;

export const DEFAULT_CURRENCY = "NPR";
export const CURRENCY_CODES = CURRENCIES.map((currency) => currency.code);

const CURRENCY_SYMBOLS = new Map<string, string>(CURRENCIES.map((currency) => [currency.code, currency.symbol]));

/** The symbol for a code we ship, or the bare code for one we do not. */
export function currencySymbol(code: string) {
  const upper = code.trim().toUpperCase();
  return CURRENCY_SYMBOLS.get(upper) ?? `${upper} `;
}

export const KATHMANDU = "Asia/Kathmandu";
