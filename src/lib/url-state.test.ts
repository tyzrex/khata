import assert from "node:assert/strict";
import test from "node:test";
import type { TransactionDto } from "./types";
import { dashboardQuery, EMPTY_LEDGER_FILTERS, filterTransactions, ledgerQuery, readDashboardState, readLedgerFilters } from "./url-state";

function row(partial: Partial<TransactionDto>): TransactionDto {
  return {
    id: "t",
    externalId: null,
    date: "2026-10-05",
    type: "expense",
    amount: 100,
    currency: "NPR",
    foreignAmount: null,
    fxRate: null,
    category: "Food",
    merchant: "Bhatbhateni",
    account: "Nabil",
    note: "",
    source: "manual",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

test("ledger filters round-trip through the URL and drop junk", () => {
  const filters = readLedgerFilters(new URLSearchParams("q=momo&from=2026-10-01&to=bad&type=refund&category=Food&account=NIMB"));
  assert.deepEqual(filters, { q: "momo", from: "2026-10-01", to: "", type: "", category: "Food", account: "NIMB", merchant: "" });
  assert.equal(ledgerQuery(filters), "?q=momo&from=2026-10-01&category=Food&account=NIMB");
  assert.equal(ledgerQuery(EMPTY_LEDGER_FILTERS), "");
});

test("client filtering matches the database rules", () => {
  const rows = [
    row({ id: "a", merchant: "Momo House", date: "2026-10-02" }),
    row({ id: "b", type: "income", category: "Income", merchant: "Salary", date: "2026-10-05" }),
    row({ id: "c", account: "NIMB", note: "momo with Sameer", date: "2026-10-09" }),
  ];
  const ids = (filters: Partial<typeof EMPTY_LEDGER_FILTERS>) => filterTransactions(rows, { ...EMPTY_LEDGER_FILTERS, ...filters }).map((r) => r.id);
  assert.deepEqual(ids({ q: "MOMO" }), ["a", "c"]);
  assert.deepEqual(ids({ from: "2026-10-03", to: "2026-10-09" }), ["b", "c"]);
  assert.deepEqual(ids({ type: "income" }), ["b"]);
  assert.deepEqual(ids({ category: "Food", q: "nimb" }), ["c"]);
  assert.deepEqual(ids({ account: "NIMB" }), ["c"]);
  assert.deepEqual(ids({ account: "Nabil", category: "Food" }), ["a"]);
});

test("dashboard period lives in the URL, with defaults left out", () => {
  const custom = { start: "2026-09-09", end: "2026-10-08" };
  const plain = readDashboardState(new URLSearchParams(""), "2026-10-08", custom);
  assert.deepEqual(plain, { kind: "month", anchor: "2026-10-08", custom });
  assert.equal(dashboardQuery(plain, "2026-10-08"), "");

  const week = readDashboardState(new URLSearchParams("range=week&at=2026-09-01"), "2026-10-08", custom);
  assert.equal(dashboardQuery(week, "2026-10-08"), "?range=week&at=2026-09-01");

  const picked = readDashboardState(new URLSearchParams("range=custom&from=2026-01-01&to=2026-02-01"), "2026-10-08", custom);
  assert.deepEqual(picked.custom, { start: "2026-01-01", end: "2026-02-01" });
  assert.equal(dashboardQuery(picked, "2026-10-08"), "?range=custom&from=2026-01-01&to=2026-02-01");

  assert.equal(readDashboardState(new URLSearchParams("range=decade"), "2026-10-08", custom).kind, "month");
});

test("dashboard money-in links show income and transfers within the selected dates", () => {
  const filters = readLedgerFilters(new URLSearchParams("type=credit&from=2026-10-01&to=2026-10-13"));
  const rows = [row({ id: "expense" }), row({ id: "income", type: "income" }), row({ id: "transfer", type: "transfer" }), row({ id: "outside", type: "income", date: "2026-09-30" })];
  assert.deepEqual(filterTransactions(rows, filters).map((entry) => entry.id), ["income", "transfer"]);
  assert.equal(ledgerQuery(filters), "?from=2026-10-01&to=2026-10-13&type=credit");
});

test("merchant drill-down matches the named merchant without matching other notes or names", () => {
  const filters = readLedgerFilters(new URLSearchParams(ledgerQuery({ ...EMPTY_LEDGER_FILTERS, merchant: "Cafe & Co" })));
  const rows = [row({ id: "match", merchant: "Cafe & Co" }), row({ id: "other", merchant: "Cafe & Co Express" }), row({ id: "note", note: "Cafe & Co" })];
  assert.deepEqual(filterTransactions(rows, filters).map((entry) => entry.id), ["match"]);
});
