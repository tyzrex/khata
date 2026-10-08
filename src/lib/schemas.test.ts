import assert from "node:assert/strict";
import test from "node:test";
import { ImportShapeError, manualTransactionSchema, MAX_AMOUNT, parseImportPayload, transactionFiltersSchema } from "./schemas";
import { expenseWriteSchema, settlementWriteSchema } from "./share-schemas";

const row = {
  externalId: "nabil-tea-95",
  date: "2026-10-06",
  type: "expense",
  amount: 95,
  currency: "NPR",
  category: "Food",
  merchant: "Lawa Chiya Ghar",
  account: "Nabil",
  note: "",
  source: "gmail",
};

test("import accepts a wrapper or a bare array", () => {
  assert.equal(parseImportPayload({ transactions: [row] }).rows.length, 1);
  assert.equal(parseImportPayload([row]).rows[0]?.externalId, "nabil-tea-95");
});

test("import reports an invalid row without dropping the valid one", () => {
  const parsed = parseImportPayload([row, { ...row, externalId: "bad", currency: "USD" }]);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.invalid.length, 1);
});

test("import rejects a shape that is not a list", () => {
  assert.throws(() => parseImportPayload({ items: [] }), ImportShapeError);
});

const manual = { date: "2026-10-06", type: "expense", amount: 95, currency: "NPR", category: "Food", merchant: "Cafe", account: "Nabil", note: "" };

test("amounts are rounded to the paisa at the boundary", () => {
  assert.equal(manualTransactionSchema.parse({ ...manual, amount: 10.005 }).amount, 10.01);
  assert.equal(manualTransactionSchema.parse({ ...manual, amount: "1234.567" }).amount, 1234.57);
});

test("amounts past the column range or below a paisa are refused, not a 500", () => {
  assert.equal(manualTransactionSchema.safeParse({ ...manual, amount: MAX_AMOUNT }).success, true);
  assert.equal(manualTransactionSchema.safeParse({ ...manual, amount: 1e13 }).success, false);
  assert.equal(manualTransactionSchema.safeParse({ ...manual, amount: 0.004 }).success, false);
  assert.equal(manualTransactionSchema.safeParse({ ...manual, amount: Number.POSITIVE_INFINITY }).success, false);
  const settlement = { fromPersonId: "a", toPersonId: "b", amount: 1e13, date: "2026-10-06" };
  assert.equal(settlementWriteSchema.safeParse(settlement).success, false);
});

test("shared expense ids and split values are bounded", () => {
  const expense = { description: "Dinner", date: "2026-10-06", amount: 900, paidById: "p", splitMode: "equal", participants: [{ personId: "p" }] };
  assert.equal(expenseWriteSchema.safeParse(expense).success, true);
  assert.equal(expenseWriteSchema.safeParse({ ...expense, paidById: "x".repeat(101) }).success, false);
  assert.equal(expenseWriteSchema.safeParse({ ...expense, participants: [{ personId: "p", weight: 1e9 }] }).success, false);
});

test("ledger filters accept blanks and reject malformed values", () => {
  const blank = transactionFiltersSchema.parse({ q: "  ", from: "", type: "" });
  assert.ok(Object.values(blank).every((value) => value === undefined), "blank params mean no filter");
  assert.deepEqual(transactionFiltersSchema.parse({ q: " tea ", from: "2026-10-01", to: "2026-10-31", type: "expense", category: "Food" }), {
    q: "tea",
    from: "2026-10-01",
    to: "2026-10-31",
    type: "expense",
    category: "Food",
  });
  assert.equal(transactionFiltersSchema.safeParse({ from: "2026-02-30" }).success, false);
  assert.equal(transactionFiltersSchema.safeParse({ from: "1' or '1'='1" }).success, false);
  assert.equal(transactionFiltersSchema.safeParse({ type: "refund" }).success, false);
  assert.equal(transactionFiltersSchema.safeParse({ q: "x".repeat(101) }).success, false);
});
