import assert from "node:assert/strict";
import test from "node:test";
import type { BalanceScope } from "@/db/shares";
import { describeOpenBalances } from "./balance-summary";

type Debt = { fromId: string; toId: string; fromName: string; toName: string; amount: number };

function scope(youOwe: Debt[] = [], youAreOwed: Debt[] = []): BalanceScope {
  return { youOwe, youAreOwed, others: [], simplified: [] };
}

const ME = "me";
const owe = (toName: string, amount: number): Debt => ({ fromId: ME, toId: toName, fromName: "Me", toName, amount });
const owed = (fromName: string, amount: number): Debt => ({ fromId: fromName, toId: ME, fromName, toName: "Me", amount });

test("returns null when nothing is outstanding", () => {
  assert.equal(describeOpenBalances({ overall: scope(), groups: [] }), null);
});

test("balances that net to zero across both directions still count as open", () => {
  // Equal in and equal out is not the same as square: each side is a live debt that
  // could be settled on its own, so this must not collapse to "nothing due".
  const open = describeOpenBalances({ overall: scope([owe("Asha", 500)], [owed("Bishal", 500)]), groups: [] });
  assert.ok(open);
  assert.equal(open.amount, 0);
  assert.equal(open.title, "Balances are open both ways");
});

test("ignores sub-paisa remainders left by a split", () => {
  assert.equal(describeOpenBalances({ overall: scope([owe("Asha", 0.004)], []), groups: [] }), null);
});

test("the same debt in two groups folds into one line for that person", () => {
  const open = describeOpenBalances({
    overall: scope([owe("Asha", 300)], []),
    groups: [scope([owe("Asha", 200)], []), scope([], [owed("Bishal", 100)])],
  });
  assert.ok(open);
  // Asha 300 + Asha 200 = 500 owed out, against 100 owed in.
  assert.equal(open.amount, -400);
  assert.equal(open.title, "Balances are open both ways");
  assert.match(open.detail, /You owe Asha/);
  assert.doesNotMatch(open.detail, /Asha, Asha/);
});

test("amount is positive when owed to you and negative when you owe", () => {
  const receivable = describeOpenBalances({ overall: scope([], [owed("Asha", 900)]), groups: [] });
  const payable = describeOpenBalances({ overall: scope([owe("Asha", 900)], []), groups: [] });
  assert.equal(receivable?.amount, 900);
  assert.equal(payable?.amount, -900);
});

test("an unchanged balance yields an unchanged fingerprint, so re-reading is idempotent", () => {
  const first = describeOpenBalances({ overall: scope([owe("Asha", 250)]), groups: [] });
  const second = describeOpenBalances({ overall: scope([owe("Asha", 250)]), groups: [] });
  assert.equal(first?.fingerprint, second?.fingerprint);
});

test("fingerprint survives floating point noise in the same amount", () => {
  // 0.1 + 0.2 !== 0.3. Without quantising before hashing, an unchanged balance would
  // fingerprint differently on every poll and re-notify about it forever.
  const a = describeOpenBalances({ overall: scope([owe("Asha", 0.1 + 0.2)]), groups: [] });
  const b = describeOpenBalances({ overall: scope([owe("Asha", 0.3)]), groups: [] });
  assert.equal(a?.fingerprint, b?.fingerprint);
});

test("changing an amount changes the fingerprint", () => {
  const before = describeOpenBalances({ overall: scope([owe("Asha", 250)]), groups: [] });
  const after = describeOpenBalances({ overall: scope([owe("Asha", 300)]), groups: [] });
  assert.notEqual(before?.fingerprint, after?.fingerprint);
});

test("adding a debt changes the fingerprint", () => {
  const before = describeOpenBalances({ overall: scope([owe("Asha", 250)]), groups: [] });
  const after = describeOpenBalances({ overall: scope([owe("Asha", 250), owe("Bishal", 100)]), groups: [] });
  assert.notEqual(before?.fingerprint, after?.fingerprint);
});

test("settling one side changes the fingerprint", () => {
  const before = describeOpenBalances({ overall: scope([owe("Asha", 250)]), groups: [] });
  const after = describeOpenBalances({ overall: scope([], [owed("Bishal", 40)]), groups: [] });
  assert.notEqual(before?.fingerprint, after?.fingerprint);
});

test("fingerprint does not depend on the order debts are listed in", () => {
  const a = describeOpenBalances({ overall: scope([owe("Asha", 100), owe("Bishal", 50)], []), groups: [] });
  const b = describeOpenBalances({ overall: scope([owe("Bishal", 50), owe("Asha", 100)], []), groups: [] });
  assert.equal(a?.fingerprint, b?.fingerprint);
});

test("direction is part of the signature, so owing and being owed never collide", () => {
  const payable = describeOpenBalances({ overall: scope([owe("Asha", 400)], []), groups: [] });
  const receivable = describeOpenBalances({ overall: scope([], [owed("Asha", 400)]), groups: [] });
  assert.notEqual(payable?.fingerprint, receivable?.fingerprint);
});

test("detail names every person and points at where to settle", () => {
  const open = describeOpenBalances({ overall: scope([owe("Asha", 400)], [owed("Bishal", 150)]), groups: [] });
  assert.ok(open);
  assert.match(open.detail, /You owe Asha/);
  assert.match(open.detail, /Bishal owes you/);
  assert.match(open.detail, /Settle up from Balances/);
});
