import assert from "node:assert/strict";
import test from "node:test";
import { ImportShapeError, parseImportPayload } from "./schemas";

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
