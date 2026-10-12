import assert from "node:assert/strict";
import test from "node:test";
import { moneySchema, manualTransactionSchema } from "./schemas";
import { roundMoney, toPaisa } from "./money";
import { roundMoney as periodRoundMoney } from "./period";
import { toPaisa as splitToPaisa } from "./split";

test("half a paisa rounds up even when the binary value sits just below it", () => {
  assert.equal(10.075 * 100, 1007.4999999999999); // the trap this helper exists for
  assert.equal(toPaisa(10.075), 1008);
  assert.equal(roundMoney(10.075), 10.08);
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(2.675), 2.68);
});

test("ordinary amounts and negatives are unchanged", () => {
  assert.equal(roundMoney(1200), 1200);
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(-10.075), -10.08);
  assert.equal(toPaisa(-0.01), -1);
  assert.equal(roundMoney(1234567.891), 1234567.89);
  assert.ok(Number.isNaN(roundMoney(Number.NaN)));
});

test("every rounding path agrees", () => {
  assert.equal(periodRoundMoney, roundMoney);
  assert.equal(splitToPaisa, toPaisa);
  assert.equal(moneySchema.parse(10.075), 10.08);
  const usd = manualTransactionSchema.parse({ date: "2026-10-08", type: "expense", currency: "USD", foreignAmount: 7.5, fxRate: 134.1, category: "Other", merchant: "Figma", account: "Cash", note: "" });
  assert.equal(usd.amount, roundMoney(7.5 * 134.1));
});
