import { expect, test } from "bun:test";
import { dashboardDebts } from "./dashboard-shares";
import type { BalanceScope, ShareBook } from "@/db/shares";

const empty = (): BalanceScope => ({ youOwe: [], youAreOwed: [], others: [], simplified: [] });
const self = { id: "you", name: "You", isSelf: true, linkedUserId: null };
const friend = (id: string) => ({ id, name: "Sameer", isSelf: false, linkedUserId: null });
const debt = (id: string, amount: number) => ({ fromId: id, toId: self.id, fromName: "Sameer", toName: "You", amount });
const book = (): ShareBook => ({
  self,
  people: [self, friend("a"), friend("b")],
  groups: [],
  joinedGroups: [],
  overall: empty(),
  expenses: [],
  settlements: [],
  links: [],
});

test("friends with the same display name retain distinct dashboard links and balances", () => {
  const value = book();
  value.overall.youAreOwed = [debt("a", 300), debt("b", 400)];
  const rows = dashboardDebts(value);
  expect(rows.map((row) => row.href)).toEqual(["/friends/b", "/friends/a"]);
  expect(rows.map((row) => row.amount)).toEqual([400, 300]);
  expect(new Set(rows.map((row) => row.key)).size).toBe(2);
});

test("opposite debts in owned groups remain outstanding even when the overall net is zero", () => {
  const value = book();
  const incoming = empty();
  incoming.youAreOwed = [debt("a", 500)];
  const outgoing = empty();
  outgoing.youOwe = [{ ...debt("a", 500), fromId: "you", toId: "a", fromName: "You", toName: "Sameer" }];
  value.groups = [
    { id: "trip", name: "Trip", kind: "group", members: [self, friend("a")], balances: incoming },
    { id: "home", name: "Home", kind: "group", members: [self, friend("a")], balances: outgoing },
  ];
  const rows = dashboardDebts(value);
  expect(rows).toHaveLength(2);
  expect(rows.filter((row) => row.incoming).reduce((total, row) => total + row.amount, 0)).toBe(500);
  expect(rows.filter((row) => !row.incoming).reduce((total, row) => total + row.amount, 0)).toBe(500);
  expect(rows.map((row) => row.context).sort()).toEqual(["Home", "Trip"]);
});

test("joined direct books open friends and joined group books open the group", () => {
  const value = book();
  const balances = empty();
  balances.youAreOwed = [debt("a", 300)];
  const base = {
    ownerName: "Sameer",
    members: [self, friend("a")],
    people: [self, friend("a")],
    self,
    balances,
    expenses: [],
    settlements: [],
  };
  value.joinedGroups = [
    { ...base, id: "direct/a", name: "Sameer", kind: "direct" },
    { ...base, id: "trip/a", name: "Trip", kind: "group" },
  ];
  expect(
    dashboardDebts(value)
      .map((row) => row.href)
      .sort(),
  ).toEqual(["/friends/direct%2Fa", "/groups/trip%2Fa"]);
  balances.youAreOwed = [debt("a", 0.001)];
  expect(dashboardDebts(value)).toHaveLength(0);
});
