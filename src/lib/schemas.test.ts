import assert from "node:assert/strict";
import test from "node:test";
import { ImportShapeError, manualTransactionSchema, MAX_AMOUNT, parseImportPayload, transactionDraftSchema, transactionFiltersSchema } from "./schemas";
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

test("a foreign amount is converted to NPR and keeps what was typed", () => {
  const parsed = manualTransactionSchema.parse({ ...manual, amount: undefined, currency: "USD", foreignAmount: 20, fxRate: 134.25 });
  assert.equal(parsed.amount, 2685);
  assert.equal(parsed.currency, "USD");
  assert.equal(parsed.foreignAmount, 20);
  assert.equal(parsed.fxRate, 134.25);
});

test("a half-specified conversion never reaches the database", () => {
  assert.equal(manualTransactionSchema.safeParse({ ...manual, amount: undefined, currency: "USD", foreignAmount: 20 }).success, false);
  assert.equal(manualTransactionSchema.safeParse({ ...manual, amount: undefined, currency: "USD", fxRate: 134 }).success, false);
  assert.equal(manualTransactionSchema.safeParse({ ...manual, amount: undefined, currency: "USD" }).success, false);
  // A rate alone is not money, and a converted total past the column is refused here too.
  assert.equal(manualTransactionSchema.safeParse({ ...manual, amount: undefined, currency: "USD", foreignAmount: MAX_AMOUNT, fxRate: 2 }).success, false);
});

test("an NPR entry drops any leftover rate instead of storing it", () => {
  // Flipping the form back to NPR must not leave the abandoned conversion on the row.
  const parsed = manualTransactionSchema.parse({ ...manual, currency: "NPR", foreignAmount: 20, fxRate: 134 });
  assert.equal(parsed.amount, 95);
  assert.equal(parsed.foreignAmount, null);
  assert.equal(parsed.fxRate, null);
});

test("currency codes are normalized and anything that is not three letters is refused", () => {
  assert.equal(manualTransactionSchema.parse({ ...manual, currency: "usd", amount: 10, foreignAmount: 1, fxRate: 10 }).currency, "USD");
  assert.equal(manualTransactionSchema.parse({ ...manual, currency: undefined }).currency, "NPR");
  assert.equal(manualTransactionSchema.safeParse({ ...manual, currency: "DOLLARS" }).success, false);
});

test("the entry form derives the NPR amount from the rate it was given", () => {
  const draft = { date: "2026-10-06", type: "expense" as const, currency: "usd", amount: "20", fxRate: "134.25", category: "Bills", merchant: "Figma", account: "Nabil", note: "" };
  const parsed = transactionDraftSchema.parse(draft);
  assert.equal(parsed.amount, 2685);
  assert.equal(parsed.currency, "USD");
  assert.equal(parsed.foreignAmount, 20);
  assert.equal(parsed.fxRate, 134.25);

  const plain = transactionDraftSchema.parse({ ...draft, currency: "NPR", amount: "95", fxRate: "" });
  assert.equal(plain.amount, 95);
  assert.equal(plain.foreignAmount, null);
  assert.equal(plain.fxRate, null);

  // A foreign amount with no rate is the one thing the form must not let through.
  assert.equal(transactionDraftSchema.safeParse({ ...draft, fxRate: "" }).success, false);
});

test("shared expense ids and split values are bounded", () => {
  const expense = { description: "Dinner", date: "2026-10-06", amount: 900, paidById: "p", splitMode: "equal", participants: [{ personId: "p" }] };
  assert.equal(expenseWriteSchema.safeParse(expense).success, true);
  assert.equal(expenseWriteSchema.safeParse({ ...expense, paidById: "x".repeat(101) }).success, false);
  assert.equal(expenseWriteSchema.safeParse({ ...expense, participants: [{ personId: "p", weight: 1e9 }] }).success, false);
  assert.equal(expenseWriteSchema.safeParse({ ...expense, version: 1 }).success, true);
  assert.equal(expenseWriteSchema.safeParse({ ...expense, version: 0 }).success, false);
  assert.equal(expenseWriteSchema.safeParse({ ...expense, version: 1.5 }).success, false);
});

test("settlement versions are optional positive integers", () => {
  const settlement = { fromPersonId: "a", toPersonId: "b", amount: 100, date: "2026-10-06" };
  assert.equal(settlementWriteSchema.safeParse(settlement).success, true);
  assert.equal(settlementWriteSchema.safeParse({ ...settlement, version: 2 }).success, true);
  assert.equal(settlementWriteSchema.safeParse({ ...settlement, version: -1 }).success, false);
  assert.equal(settlementWriteSchema.safeParse({ ...settlement, version: 2.1 }).success, false);
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
