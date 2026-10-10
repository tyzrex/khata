import { TX_TYPES, type TxType } from "@/lib/constants";
import type { DateRange, RangeKind } from "@/lib/dashboard";
import type { TransactionDto } from "@/lib/types";

/**
 * Filters and ranges live in the URL so a filtered ledger or a dashboard period can be
 * bookmarked, shared, and survives a reload or the back button. These helpers are the
 * only place that reads or writes those params.
 */

type Params = { get(name: string): string | null };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoOrEmpty(value: string | null) {
  return value && ISO_DATE.test(value) ? value : "";
}

export type LedgerFilters = {
  q: string;
  from: string;
  to: string;
  type: "" | TxType;
  category: string;
  account: string;
};

export const EMPTY_LEDGER_FILTERS: LedgerFilters = { q: "", from: "", to: "", type: "", category: "", account: "" };

export function readLedgerFilters(params: Params): LedgerFilters {
  const type = params.get("type") ?? "";
  return {
    q: (params.get("q") ?? "").slice(0, 120),
    from: isoOrEmpty(params.get("from")),
    to: isoOrEmpty(params.get("to")),
    type: (TX_TYPES as readonly string[]).includes(type) ? (type as TxType) : "",
    category: (params.get("category") ?? "").slice(0, 80),
    account: (params.get("account") ?? "").slice(0, 40),
  };
}

/** Empty values are dropped so the plain page stays at a plain URL. */
export function ledgerQuery(filters: LedgerFilters) {
  const params = new URLSearchParams();
  for (const key of ["q", "from", "to", "type", "category", "account"] as const) {
    const value = filters[key].trim();
    if (value) params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Same rules as the database filter in listTransactions, applied to rows already on the client. */
export function filterTransactions(rows: TransactionDto[], filters: LedgerFilters) {
  const needle = filters.q.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.from && row.date < filters.from) return false;
    if (filters.to && row.date > filters.to) return false;
    if (filters.type && row.type !== filters.type) return false;
    if (filters.category && row.category !== filters.category) return false;
    if (filters.account && row.account !== filters.account) return false;
    if (!needle) return true;
    return [row.merchant, row.note, row.account, row.category, row.externalId ?? ""].some((field) => field.toLowerCase().includes(needle));
  });
}

const RANGE_KINDS: readonly RangeKind[] = ["week", "month", "year", "all", "custom"];

export type DashboardState = {
  kind: RangeKind;
  /** The date the stepped period is anchored on. */
  anchor: string;
  custom: DateRange;
};

export function readDashboardState(params: Params, today: string, defaultCustom: DateRange): DashboardState {
  const kind = params.get("range") ?? "";
  const from = isoOrEmpty(params.get("from"));
  const to = isoOrEmpty(params.get("to"));
  return {
    kind: (RANGE_KINDS as readonly string[]).includes(kind) ? (kind as RangeKind) : "month",
    anchor: isoOrEmpty(params.get("at")) || today,
    custom: from && to && from <= to ? { start: from, end: to } : defaultCustom,
  };
}

export function dashboardQuery(state: DashboardState, today: string) {
  const params = new URLSearchParams();
  if (state.kind !== "month") params.set("range", state.kind);
  if (state.kind === "custom") {
    params.set("from", state.custom.start);
    params.set("to", state.custom.end);
  } else if (state.anchor !== today && state.kind !== "all") params.set("at", state.anchor);
  const text = params.toString();
  return text ? `?${text}` : "";
}
