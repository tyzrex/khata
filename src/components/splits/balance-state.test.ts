import { describe, expect, test } from "bun:test";
import {
  friendBalanceTotals,
  friendHasOpenBalance,
  type BookRow,
} from "./friend-entries";
import { hasOpenBalance } from "./ledger-math";
import type { BalanceScope } from "@/db/shares";

const row = (id: string, net: number): BookRow => ({
  id,
  name: id,
  direct: false,
  net,
});

describe("split page balance status", () => {
  test("equal debts in different friend books remain open and keep both totals", () => {
    const friend = { net: 0, rows: [row("trip", 500), row("flat", -500)] };
    expect(friendHasOpenBalance(friend)).toBe(true);
    expect(friendBalanceTotals(friend)).toEqual({ owed: 500, owe: 500 });
  });

  test("a friend with no books uses their outside balance", () => {
    expect(friendBalanceTotals({ net: -300, rows: [] })).toEqual({
      owed: 0,
      owe: 300,
    });
    expect(friendHasOpenBalance({ net: -300, rows: [] })).toBe(true);
  });

  test("settled books and sub-paisa rounding do not require payments", () => {
    expect(
      friendHasOpenBalance({ net: 0.001, rows: [row("trip", 0.001)] }),
    ).toBe(false);
    expect(friendHasOpenBalance({ net: 0, rows: [row("trip", 0)] })).toBe(
      false,
    );
  });

  test("equal group debts to different people are open despite a zero net", () => {
    const scope: BalanceScope = {
      youOwe: [
        { fromId: "you", toId: "a", fromName: "You", toName: "A", amount: 100 },
      ],
      youAreOwed: [
        { fromId: "b", toId: "you", fromName: "B", toName: "You", amount: 100 },
      ],
      others: [],
      simplified: [],
    };
    expect(hasOpenBalance(scope)).toBe(true);
    expect(hasOpenBalance({ ...scope, youOwe: [], youAreOwed: [] })).toBe(
      false,
    );
    expect(
      hasOpenBalance({
        ...scope,
        youOwe: [],
        youAreOwed: [{ ...scope.youAreOwed[0], amount: 0.001 }],
      }),
    ).toBe(false);
  });
});
