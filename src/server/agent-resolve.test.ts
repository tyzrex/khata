import assert from "node:assert/strict";
import test from "node:test";
import type { BalanceScope, ShareBook } from "@/db/shares";
import { generateApiKey, hashApiKey, isApiKey, readApiKey } from "./agent/keys";
import { AgentInputError, matchNamed, matchPerson, parseAmount, resolveAccount, resolveCategory, resolveDate, suggest } from "./agent/match";
import { balanceLines, friendBalances, planExpense, planSettlement } from "./agent/plan";
import { expenseInput, transactionInput } from "./agent/schemas";

const TODAY = "2026-10-08";
const empty: BalanceScope = { youOwe: [], youAreOwed: [], others: [], simplified: [] };

const self = { id: "self", name: "You", isSelf: true, linkedUserId: "u1" };
const sameer = { id: "p-sameer", name: "Sameer Shrestha", isSelf: false, linkedUserId: null };
const anita = { id: "p-anita", name: "Anita", isSelf: false, linkedUserId: "u2" };
const rajan = { id: "p-rajan", name: "Rajan", isSelf: false, linkedUserId: null };

function book(overrides: Partial<ShareBook> = {}): ShareBook {
  return {
    self,
    people: [self, anita, rajan, sameer],
    groups: [
      { id: "g-bikers", name: "Biker Gang", kind: "group", members: [self, sameer, anita, rajan], balances: empty },
      { id: "g-flat", name: "Flat", kind: "group", members: [self, anita], balances: empty },
    ],
    joinedGroups: [],
    overall: empty,
    expenses: [],
    settlements: [],
    links: [],
    ...overrides,
  };
}

function rejects(run: () => unknown, pattern: RegExp) {
  assert.throws(run, (error: unknown) => error instanceof AgentInputError && pattern.test(error.message));
}

test("matchPerson resolves self words, exact names and unique first names", () => {
  const people = book().people;
  assert.equal(matchPerson("me", people, "self").id, "self");
  assert.equal(matchPerson("I", people, "self").id, "self");
  assert.equal(matchPerson("ANITA", people, "self").id, "p-anita");
  assert.equal(matchPerson("sameer", people, "self").id, "p-sameer");
  assert.equal(matchPerson("p-rajan", people, "self").id, "p-rajan");
});

test("matchPerson treats the account name as self unless a friend has that exact name", () => {
  const people = book().people;
  assert.equal(matchPerson("Sulav", people, "self", { accountName: "Sulav" }).id, "self");
  assert.equal(matchPerson("Anita", people, "self", { accountName: "Anita" }).id, "p-anita");
});

test("a near miss is suggested, never picked", () => {
  rejects(() => matchPerson("Sam", book().people, "self"), /No person named "Sam"\. Did you mean "Sameer Shrestha"\?/);
  rejects(() => matchPerson("Anitha", book().people, "self"), /Did you mean "Anita"/);
  rejects(() => matchPerson("Zed", book().people, "self"), /Known:/);
});

test("two people with the same first name are ambiguous", () => {
  const people = [self, { id: "a1", name: "Ram Thapa" }, { id: "a2", name: "Ram KC" }];
  rejects(() => matchPerson("Ram", people, "self"), /more than one person/);
});

test("matchNamed carries candidates on the error", () => {
  try {
    matchNamed("bikers", [{ id: "g", name: "Biker Gang" }], "group");
    assert.fail("expected an error");
  } catch (error) {
    assert.ok(error instanceof AgentInputError);
    assert.deepEqual(error.candidates, ["Biker Gang"]);
  }
});

test("suggest ranks prefix matches before typos", () => {
  assert.deepEqual(suggest("an", ["Rajan", "Anita", "Anil"]), ["Anil", "Anita", "Rajan"]);
  assert.deepEqual(suggest("rajn", ["Rajan", "Anita"]), ["Rajan"]);
});

test("parseAmount reads common money spellings", () => {
  assert.equal(parseAmount(1200), 1200);
  assert.equal(parseAmount("1,200"), 1200);
  assert.equal(parseAmount("Rs. 1,200.50"), 1200.5);
  assert.equal(parseAmount("NPR 450"), 450);
  assert.ok(Number.isNaN(parseAmount("twelve")));
});

test("resolveDate understands today, yesterday and ISO dates", () => {
  assert.equal(resolveDate(undefined, TODAY), TODAY);
  assert.equal(resolveDate("yesterday", TODAY), "2026-10-07");
  assert.equal(resolveDate("2026-03-01", "2026-03-01"), "2026-03-01");
  assert.equal(resolveDate("yesterday", "2026-03-01"), "2026-02-28");
});

test("resolveAccount matches the person's own accounts", () => {
  const mine = ["Nabil", "NIMB", "Cash"];
  assert.equal(resolveAccount(undefined, mine), "Nabil");
  assert.equal(resolveAccount("", mine), "Nabil");
  assert.equal(resolveAccount("nabil", mine), "Nabil");
  assert.equal(resolveAccount("Nabil Bank", mine), "Nabil");
  assert.equal(resolveAccount("cash", mine), "Cash");
  rejects(() => resolveAccount("Chase", mine), /Unknown account/);
  // A book with no accounts is a mistake the caller has to fix, not a silent fallback.
  rejects(() => resolveAccount("Nabil", []), /no accounts yet/);
});

test("resolveCategory reuses an existing name and defaults by type", () => {
  assert.equal(resolveCategory("food", "expense", ["Food", "Transport"]), "Food");
  assert.equal(resolveCategory("Gym", "expense", ["Food"]), "Gym");
  assert.equal(resolveCategory("", "income", []), "Income");
  assert.equal(resolveCategory(undefined, "expense", []), "Other");
});

test("transactionInput fills defaults and reads loose values", () => {
  const parsed = transactionInput(TODAY).parse({ amount: "1,250", description: "Lunch" });
  assert.equal(parsed.amount, 1250);
  assert.equal(parsed.type, "expense");
  assert.equal(parsed.date, TODAY);
  assert.equal(transactionInput(TODAY).safeParse({ amount: 10 }).success, false);
  assert.equal(transactionInput(TODAY).safeParse({ amount: "ten", merchant: "x" }).success, false);
});

test("expenseInput accepts a comma list and a split map", () => {
  const parsed = expenseInput(TODAY).parse({ description: "Dinner", amount: 900, splitWith: "Sameer, Anita and Rajan", split: { Sameer: 100 } });
  assert.deepEqual(parsed.splitWith, ["Sameer", "Anita", "Rajan"]);
  assert.deepEqual(parsed.split, [{ person: "Sameer", value: 100 }]);
  assert.equal(parsed.date, TODAY);
});

const base = { description: "Dinner", amount: 900, date: TODAY, note: "" };

test("planExpense splits equally with named friends, me and the payer", () => {
  const plan = planExpense(book(), { ...base, splitWith: ["Sameer", "Anita"] });
  assert.equal(plan.write.paidById, "self");
  assert.equal(plan.write.groupId, null);
  assert.equal(plan.directWith, null);
  assert.deepEqual(
    plan.splits.map((share) => [share.personId, share.amount]),
    [
      ["p-sameer", 300],
      ["p-anita", 300],
      ["self", 300],
    ],
  );
});

test("planExpense with a single friend goes to the direct book", () => {
  const plan = planExpense(book(), { ...base, splitWith: ["Rajan"] });
  assert.equal(plan.directWith, "p-rajan");
});

test("planExpense with a group and no names splits among every member", () => {
  const plan = planExpense(book(), { ...base, amount: 1000, group: "biker gang" });
  assert.equal(plan.write.groupId, "g-bikers");
  assert.equal(plan.splits.length, 4);
  assert.equal(plan.splits.reduce((total, share) => total + share.amount, 0), 1000);
});

test("planExpense rejects a person who is not in the named group", () => {
  rejects(() => planExpense(book(), { ...base, group: "Flat", splitWith: ["Rajan"] }), /No person named "Rajan" in "Flat"/);
});

test("excludeMe with me paying turns into exact shares with my zero", () => {
  const plan = planExpense(book(), { ...base, amount: 500, splitWith: ["Anita"], excludeMe: true });
  assert.equal(plan.write.splitMode, "exact");
  assert.deepEqual(
    plan.splits.map((share) => [share.personId, share.amount]),
    [
      ["p-anita", 500],
      ["self", 0],
    ],
  );
});

test("someone else paying is included in the split", () => {
  const plan = planExpense(book(), { ...base, paidBy: "Anita", splitWith: ["Rajan"] });
  assert.equal(plan.write.paidById, "p-anita");
  assert.deepEqual(new Set(plan.splits.map((share) => share.personId)), new Set(["p-rajan", "p-anita", "self"]));
});

test("exact and percent splits take values from split", () => {
  const exact = planExpense(book(), { ...base, split: [{ person: "me", value: 600 }, { person: "Anita", value: 300 }] });
  assert.equal(exact.write.splitMode, "exact");
  assert.deepEqual(exact.splits.map((share) => share.amount), [600, 300]);
  rejects(() => planExpense(book(), { ...base, split: [{ person: "me", value: 100 }, { person: "Anita", value: 100 }] }), /add up to the total/);
  const percent = planExpense(book(), { ...base, splitMode: "percent", split: [{ person: "me", value: 50 }, { person: "Anita", value: 50 }] });
  assert.deepEqual(percent.splits.map((share) => share.amount), [450, 450]);
  rejects(() => planExpense(book(), { ...base, splitMode: "shares" }), /needs "split"/);
});

test("planExpense asks for people when there is no group", () => {
  rejects(() => planExpense(book(), { ...base }), /splitWith/);
});

test("names only in a joined book pick that book", () => {
  const ownerSelf = { id: "o-mine", name: "You", isSelf: true, linkedUserId: "u1" };
  const owner = { id: "o-owner", name: "Bibek", isSelf: false, linkedUserId: "u9" };
  const kiran = { id: "o-kiran", name: "Kiran", isSelf: false, linkedUserId: null };
  const joined: ShareBook["joinedGroups"][number] = {
    id: "jg",
    name: "Office lunch",
    kind: "group",
    ownerName: "Bibek",
    members: [ownerSelf, owner, kiran],
    people: [ownerSelf, owner, kiran],
    self: ownerSelf,
    balances: empty,
    expenses: [],
    settlements: [],
  };
  const plan = planExpense(book({ joinedGroups: [joined] }), { ...base, splitWith: ["Kiran", "Bibek"] });
  assert.equal(plan.write.groupId, "jg");
  assert.equal(plan.write.paidById, "o-mine");
  assert.equal(plan.directWith, null);
});

test("planSettlement defaults to me and records where the debt lives", () => {
  const owed: BalanceScope = { ...empty, youAreOwed: [{ fromId: "p-sameer", toId: "self", fromName: "Sameer Shrestha", toName: "You", amount: 500 }] };
  const shares = book({ groups: [{ id: "g-bikers", name: "Biker Gang", kind: "group", members: [self, sameer, anita, rajan], balances: owed }] });
  const plan = planSettlement(shares, { from: "Sameer", amount: 500, date: TODAY, note: "" });
  assert.equal(plan.write.fromPersonId, "p-sameer");
  assert.equal(plan.write.toPersonId, "self");
  assert.equal(plan.write.groupId, "g-bikers");

  const direct = planSettlement(book(), { to: "Rajan", amount: 100, date: TODAY, note: "" });
  assert.equal(direct.directWith, "p-rajan");
  rejects(() => planSettlement(book(), { amount: 100, date: TODAY, note: "" }), /Say who paid/);
});

test("balance sentences read naturally", () => {
  const overall: BalanceScope = {
    ...empty,
    youAreOwed: [{ fromId: "p-sameer", toId: "self", fromName: "Sameer Shrestha", toName: "You", amount: 1425 }],
    youOwe: [{ fromId: "self", toId: "p-anita", fromName: "You", toName: "Anita", amount: 2000 }],
  };
  const shares = book({ overall });
  assert.deepEqual(balanceLines(shares), ["Sameer Shrestha owes you NPR 1,425", "You owe Anita NPR 2,000"]);
  const friends = friendBalances(shares);
  assert.equal(friends.find((friend) => friend.id === "p-rajan")?.summary, "You and Rajan are settled up");
  assert.equal(friends.find((friend) => friend.id === "p-anita")?.net, -2000);
});

test("API keys are prefixed, hashed and read from either header", () => {
  const { token, prefix, hash } = generateApiKey();
  assert.ok(isApiKey(token));
  assert.ok(token.startsWith(prefix));
  assert.equal(hash, hashApiKey(token));
  assert.notEqual(hash, token);
  assert.equal(readApiKey(new Headers({ authorization: `Bearer ${token}` })), token);
  assert.equal(readApiKey(new Headers({ "x-api-key": token })), token);
  assert.equal(readApiKey(new Headers({ authorization: "Bearer some-session-token" })), null);
  assert.equal(readApiKey(new Headers()), null);
});
