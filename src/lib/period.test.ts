import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { monthBounds, summarize, weekBounds } from "./period";

test("the week of 7 Oct 2026 runs Monday to Sunday", () => {
  assert.deepEqual(weekBounds("2026-10-07"), { start: "2026-10-05", end: "2026-10-11" });
  assert.deepEqual(monthBounds("2026-10-07"), { start: "2026-10-01", end: "2026-10-31" });
});

test("sample week spends 820 and credits 3600", () => {
  const seed = JSON.parse(readFileSync(path.join(process.cwd(), "seed/week-of-2026-10-05.json"), "utf8")) as {
    transactions: { date: string; type: "expense" | "income" | "transfer"; amount: number; category: string }[];
  };
  const summary = summarize(seed.transactions, "2026-10-07");
  assert.equal(summary.week.spent, 820);
  assert.equal(summary.week.credits, 3600);
  assert.equal(summary.week.income, 1600);
  assert.equal(summary.week.transfers, 2000);
  assert.equal(summary.week.net, 2780);
  assert.equal(summary.month.spent, 820);
  assert.equal(summary.month.credits, 3600);
  assert.equal(summary.week.byCategory[0]?.category, "Entertainment");
  assert.equal(summary.week.byCategory[0]?.amount, 675);
  assert.equal(summary.week.daily.find((day) => day.date === "2026-10-06")?.spent, 820);
  assert.equal(summary.week.daily.find((day) => day.date === "2026-10-05")?.spent, 0);
  assert.equal(summary.week.daily.length, 7);
});
