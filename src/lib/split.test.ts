import assert from "node:assert/strict";
import test from "node:test";
import { sampleExpenses, sampleSettlements } from "./sample-book";
import { buildSplits, netsFromDebts, pairwiseDebts, simplifyNets } from "./split";

test("equal split of NPR 100 across three people keeps the paisa", () => {
  const splits = buildSplits({
    mode: "equal",
    total: 100,
    paidById: "a",
    participants: [{ personId: "a" }, { personId: "b" }, { personId: "c" }],
  });
  assert.deepEqual(
    splits.map((split) => split.amount),
    [33.34, 33.33, 33.33],
  );
  assert.equal(
    splits.reduce((total, split) => total + split.amount, 0),
    100,
  );
});

test("exact shares must add up to the total", () => {
  assert.throws(
    () =>
      buildSplits({
        mode: "exact",
        total: 100,
        paidById: "a",
        participants: [
          { personId: "a", amount: 40 },
          { personId: "b", amount: 40 },
        ],
      }),
    /add up/,
  );
});

test("the sample book leaves you owing Anita and owed by Sameer and Rajan", () => {
  const expenses = sampleExpenses.map((expense) => {
    const splits = buildSplits({
      mode: expense.splitMode,
      total: expense.amount,
      paidById: expense.paidById,
      participants: expense.participants,
    });
    return { groupId: expense.groupId, paidById: expense.paidById, splits };
  });
  const settlements = sampleSettlements.map((settlement) => ({
    groupId: settlement.groupId,
    fromPersonId: settlement.fromPersonId,
    toPersonId: settlement.toPersonId,
    amount: settlement.amount,
  }));
  const debts = pairwiseDebts(expenses, settlements);
  const youOwe = debts.filter((debt) => debt.fromId === "person-self");
  const youAreOwed = debts.filter((debt) => debt.toId === "person-self");
  assert.deepEqual(youOwe, [{ fromId: "person-self", toId: "person-anita", amount: 2000 }]);
  assert.deepEqual(youAreOwed, [
    { fromId: "person-sameer", toId: "person-self", amount: 1425 },
    { fromId: "person-rajan", toId: "person-self", amount: 300 },
  ]);

  const people = ["person-self", "person-sameer", "person-anita", "person-rajan"];
  const nets = netsFromDebts(people, debts);
  assert.equal(nets.find((net) => net.id === "person-self")?.amount, -275);
  const simplified = simplifyNets(nets);
  const youPay = simplified.filter((debt) => debt.fromId === "person-self").reduce((total, debt) => total + debt.amount, 0);
  const youReceive = simplified.filter((debt) => debt.toId === "person-self").reduce((total, debt) => total + debt.amount, 0);
  assert.equal(Math.round((youPay - youReceive) * 100), 27500);
});
