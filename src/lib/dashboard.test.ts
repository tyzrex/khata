import assert from "node:assert/strict";
import test from "node:test";
import { accountBalances, addDays, balanceTrail, change, computeStats, describeRange, previousRange, rangeFor, shiftAnchor, type Money } from "./dashboard";

const rows: Money[] = [
  { date: "2026-10-05", type: "expense", amount: 100, category: "Food", merchant: "Cafe", account: "Nabil" },
  { date: "2026-10-06", type: "expense", amount: 300, category: "Food", merchant: "Cafe", account: "Nabil" },
  { date: "2026-10-07", type: "expense", amount: 200, category: "Transport", merchant: "Pathao", account: "NIMB" },
  { date: "2026-10-07", type: "income", amount: 1000, category: "Income", merchant: "Salary", account: "Nabil" },
  { date: "2026-09-30", type: "expense", amount: 50, category: "Food", merchant: "Cafe", account: "Nabil" },
];

test("ranges follow the anchor and move one period at a time", () => {
  assert.deepEqual(rangeFor("week", "2026-10-07"), { start: "2026-10-05", end: "2026-10-11" });
  assert.deepEqual(rangeFor("month", "2026-10-07"), { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(rangeFor("year", "2026-10-07"), { start: "2026-01-01", end: "2026-12-31" });
  assert.equal(shiftAnchor("week", "2026-10-07", -1), "2026-09-30");
  assert.equal(shiftAnchor("month", "2026-01-15", -1), "2025-12-01");
  assert.equal(shiftAnchor("year", "2026-10-07", 1), "2027-10-07");
});

test("the previous range is the period just before", () => {
  assert.deepEqual(previousRange("week", { start: "2026-10-05", end: "2026-10-11" }), { start: "2026-09-28", end: "2026-10-04" });
  assert.deepEqual(previousRange("month", { start: "2026-03-01", end: "2026-03-31" }), { start: "2026-02-01", end: "2026-02-28" });
  assert.deepEqual(previousRange("custom", { start: "2026-10-10", end: "2026-10-12" }), { start: "2026-10-07", end: "2026-10-09" });
});

test("ranges read naturally", () => {
  assert.equal(describeRange("week", { start: "2026-10-05", end: "2026-10-11" }), "5 – 11 Oct 2026");
  assert.equal(describeRange("month", { start: "2026-10-01", end: "2026-10-31" }), "October 2026");
  assert.equal(describeRange("custom", { start: "2026-09-28", end: "2026-10-04" }), "28 Sep – 4 Oct 2026");
});

test("stats roll up one week", () => {
  const stats = computeStats(rows, { start: "2026-10-05", end: "2026-10-11" }, "2026-10-07");
  assert.equal(stats.spent, 600);
  assert.equal(stats.credits, 1000);
  assert.equal(stats.net, 400);
  assert.equal(stats.savingsRate, 0.4);
  assert.equal(stats.byCategory[0]?.category, "Food");
  assert.equal(stats.byCategory[0]?.share, 400 / 600);
  assert.equal(stats.topMerchants[0]?.merchant, "Cafe");
  assert.equal(stats.biggest?.amount, 300);
  assert.equal(stats.series.length, 7);
  assert.equal(stats.series[2]?.spent, 200);
  assert.equal(stats.series[2]?.credits, 1000);
  assert.equal(stats.avgDaily, 200);
  assert.equal(stats.projected, 1400);
});

test("a finished range has no projection and a year buckets by month", () => {
  const week = computeStats(rows, { start: "2026-09-28", end: "2026-10-04" }, "2026-10-07");
  assert.equal(week.projected, null);
  assert.equal(week.spent, 50);
  const year = computeStats(rows, { start: "2026-01-01", end: "2026-12-31" }, "2026-10-07");
  assert.equal(year.granularity, "month");
  assert.equal(year.series.length, 12);
  assert.equal(year.series[8]?.spent, 50);
  assert.equal(year.series[9]?.spent, 600);
});

test("comparison and account balances", () => {
  assert.equal(change(150, 100), 0.5);
  assert.equal(change(10, 0), null);
  const balances = accountBalances(rows);
  assert.equal(balances.find((row) => row.account === "Nabil")?.balance, 550);
  assert.equal(balances.find((row) => row.account === "NIMB")?.balance, -200);
});

test("a BS month is a BS month, not an AD one", () => {
  // 2026-10-08 is 22 Ashwin 2083, so the period runs Ashwin 1 to its last day.
  const range = rangeFor("month", "2026-10-08", {}, "BS");
  assert.deepEqual(range, { start: "2026-09-17", end: "2026-10-17" });
  assert.equal(shiftAnchor("month", "2026-10-08", 1, "BS"), addDays(range.end, 1));
  assert.equal(previousRange("month", range, "BS").end, addDays(range.start, -1));
  const bs = { calendar: "BS", script: "en" } as const;
  assert.equal(describeRange("month", range, bs), "Ashwin 2083");
  assert.equal(describeRange("year", rangeFor("year", "2026-10-08", {}, "BS"), bs), "2083");
});

test("a BS year buckets by BS month", () => {
  const bs = { calendar: "BS", script: "en" } as const;
  const year = rangeFor("year", "2026-10-08", {}, "BS");
  const stats = computeStats(rows, year, "2026-10-08", bs);
  assert.equal(stats.granularity, "month");
  assert.equal(stats.series.length, 12);
  assert.equal(stats.series[0]?.label, "Baishakh");
  assert.equal(stats.spent, 650);
});

test("balance trail closes each bucket with the running balance and stops at today", () => {
  const stats = computeStats(rows, { start: "2026-10-05", end: "2026-10-11" }, "2026-10-07");
  const trail = balanceTrail(rows, stats.series, stats.range.end, "2026-10-07");
  assert.deepEqual(trail, [
    { key: "2026-10-05", balance: -150 },
    { key: "2026-10-06", balance: -450 },
    { key: "2026-10-07", balance: 350 },
  ]);
});

test("balance trail over month buckets closes at the month end", () => {
  const stats = computeStats(rows, { start: "2026-09-01", end: "2026-12-31" }, "2026-10-07");
  const trail = balanceTrail(rows, stats.series, stats.range.end, "2026-10-07");
  assert.deepEqual(trail, [
    { key: "2026-09-01", balance: -50 },
    { key: "2026-10-01", balance: 350 },
  ]);
});
