import type { CategoryKind, TxType } from "@/lib/constants";

export type TransactionDto = {
  id: string;
  externalId: string | null;
  date: string;
  type: TxType;
  /** Always the NPR value. Every total, summary and split reads this and nothing else. */
  amount: number;
  /** The currency the entry was typed in. `"NPR"` for everything that is not foreign. */
  currency: string;
  /** What was typed, in `currency`; null for a plain NPR entry. */
  foreignAmount: number | null;
  /** NPR per one unit of `currency`; null for a plain NPR entry. */
  fxRate: number | null;
  category: string;
  merchant: string;
  account: string;
  note: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type CategoryDto = {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  sortOrder: number;
};

export type AccountDto = {
  id: string;
  name: string;
  sortOrder: number;
};

export type CategorySlice = {
  category: string;
  amount: number;
  count: number;
  color: string;
};

export type DaySpend = {
  date: string;
  label: string;
  spent: number;
};

export type PeriodSummary = {
  start: string;
  end: string;
  spent: number;
  credits: number;
  income: number;
  transfers: number;
  net: number;
  expenseCount: number;
  creditCount: number;
  byCategory: CategorySlice[];
  daily: DaySpend[];
};

export type SummaryResponse = {
  today: string;
  timezone: "Asia/Kathmandu";
  totalCount: number;
  week: PeriodSummary;
  month: PeriodSummary;
};

export type ImportResult = {
  created: number;
  updated: number;
  invalid: { index: number; message: string }[];
};
