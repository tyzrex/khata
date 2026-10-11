import assert from "node:assert/strict";
import test from "node:test";
import type { FeedItem } from "@/components/splits/ledger-math";
import {
  applyGroupFilters,
  describeGroupFeedFilters,
  EMPTY_GROUP_FEED_FILTERS,
  hasGroupFeedFilters,
  readGroupFeedFilters,
  writeGroupFeedFilters,
  type GroupFeedFilters,
} from "./group-filters";

type Person = { id: string; name: string };
const MEMBERS: Person[] = [
  { id: "p1", name: "Asha" },
  { id: "p2", name: "Bishal" },
  { id: "p3", name: "Chandra" },
];

type ExpenseOverrides = {
  date?: string;
  description?: string;
  note?: string;
  amount?: number;
  paidById?: string;
  paidByName?: string;
  category?: string | null;
  splits?: { personId: string; name: string; amount: number }[];
};

function expense(id: string, over: ExpenseOverrides = {}): FeedItem {
  return {
    kind: "expense",
    date: over.date ?? "2026-10-05",
    id,
    expense: {
      id,
      description: "Dinner",
      note: "",
      amount: 100,
      paidById: "p1",
      paidByName: "Asha",
      category: null,
      splits: [],
      ...over,
    },
  } as FeedItem;
}

function payment(id: string, over: Record<string, unknown> = {}) {
  return {
    kind: "settlement" as const,
    date: "2026-10-06",
    id,
    settlement: { id, fromPersonId: "p2", fromName: "Bishal", toPersonId: "p1", toName: "Asha", amount: 50, note: "", ...over },
  } as FeedItem;
}

const items: FeedItem[] = [
  expense("e1", { description: "Dinner", note: "team meal", amount: 300, category: "Food", splits: [{ personId: "p2", name: "Bishal", amount: 150 }] }),
  expense("e2", { date: "2026-09-20", description: "Taxi", amount: 80, paidById: "p3", paidByName: "Chandra", category: "Transport" }),
  expense("e3", { date: "2026-10-07", description: "Hotel", note: "3 nights", amount: 900, paidById: "p2", paidByName: "Bishal", category: "Stay" }),
  payment("s1"),
];

const run = (filters: Partial<GroupFeedFilters> = {}) => applyGroupFilters(items, { ...EMPTY_GROUP_FEED_FILTERS, ...filters }, { members: MEMBERS });

test("no filters keeps every row", () => {
  assert.equal(run().length, 4);
  assert.equal(hasGroupFeedFilters(EMPTY_GROUP_FEED_FILTERS), false);
});

test("free text matches description or note", () => {
  assert.deepEqual(run({ q: "taxi" }).map((item) => item.id), ["e2"]);
  assert.deepEqual(run({ q: "3 nights" }).map((item) => item.id), ["e3"]);
  // Case-insensitive, and it also reaches the payer's name.
  assert.deepEqual(run({ q: "CHANDRA" }).map((item) => item.id), ["e2"]);
  assert.deepEqual(run({ q: "nothing here" }), []);
});

test("category narrows to expenses with that category and drops payments", () => {
  assert.deepEqual(run({ category: "Stay" }).map((item) => item.id), ["e3"]);
  // A payment has no category, so it cannot satisfy a category filter.
  assert.deepEqual(run({ category: "Food" }).map((item) => item.id), ["e1"]);
});

test("member matches payer, participant, or either side of a payment", () => {
  assert.deepEqual(run({ member: "p1" }).map((item) => item.id), ["s1", "e1"]);
  assert.deepEqual(run({ member: "p2" }).map((item) => item.id), ["e3", "s1", "e1"]);
  assert.deepEqual(run({ member: "p3" }).map((item) => item.id), ["e2"]);
});

test("entry type splits expenses from payments", () => {
  assert.deepEqual(run({ type: "expense" }).map((item) => item.id), ["e3", "e1", "e2"]);
  assert.deepEqual(run({ type: "payment" }).map((item) => item.id), ["s1"]);
});

test("date range is inclusive on both ends", () => {
  assert.deepEqual(run({ from: "2026-10-05" }).map((item) => item.id), ["e3", "s1", "e1"]);
  assert.deepEqual(run({ to: "2026-09-20" }).map((item) => item.id), ["e2"]);
  assert.deepEqual(run({ from: "2026-09-20", to: "2026-10-05" }).map((item) => item.id), ["e1", "e2"]);
});

test("filters combine as an AND", () => {
  assert.deepEqual(run({ q: "dinner", category: "Food", from: "2026-10-01" }).map((item) => item.id), ["e1"]);
  assert.deepEqual(run({ q: "dinner", category: "Stay" }), []);
});

test("malformed URL values fall back to defaults instead of throwing", () => {
  const filters = readGroupFeedFilters(new URLSearchParams("type=nonsense&from=not-a-date&to=2026-13-99&q=%20%20hello%20%20&category=&member="));
  assert.equal(filters.type, "all");
  assert.equal(filters.from, "");
  assert.equal(filters.to, "");
  assert.equal(filters.q, "hello");
  assert.equal(filters.category, "");
  assert.equal(filters.member, "");
});

test("defaults are left out of the URL so shared links stay short", () => {
  const written = writeGroupFeedFilters(new URLSearchParams("tab=balances"), { ...EMPTY_GROUP_FEED_FILTERS, q: "dinner", type: "all" });
  assert.equal(written.get("tab"), "balances");
  assert.equal(written.get("q"), "dinner");
  assert.equal(written.has("type"), false);
  assert.equal(written.has("category"), false);

  const cleared = writeGroupFeedFilters(written, EMPTY_GROUP_FEED_FILTERS);
  assert.equal(cleared.has("q"), false);
});

test("filters round-trip through the URL", () => {
  const filters: GroupFeedFilters = { q: "taxi", category: "Transport", member: "p3", type: "payment", from: "2026-01-01", to: "2026-12-31" };
  assert.deepEqual(readGroupFeedFilters(writeGroupFeedFilters(new URLSearchParams(), filters)), filters);
});

test("the summary names what is being narrowed", () => {
  assert.deepEqual(describeGroupFeedFilters(EMPTY_GROUP_FEED_FILTERS), []);
  assert.deepEqual(describeGroupFeedFilters({ ...EMPTY_GROUP_FEED_FILTERS, q: "taxi", category: "Transport", type: "expense", from: "2026-01-01" }), [
    "matching “taxi”",
    "Transport",
    "expenses only",
    "2026-01-01 to today",
  ]);
});
