import { expect, test } from "bun:test";
import type { ShareBook } from "@/db/shares";
import { expenseInput, keyInput } from "@/server/agent/schemas";
import { planExpense } from "@/server/agent/plan";
import { validateExpenseItems } from "@/lib/itemized-split";
const self = { id: "self", name: "You", isSelf: true, linkedUserId: null };
const anita = { id: "anita", name: "Anita", isSelf: false, linkedUserId: null };
const sameer = { id: "sameer", name: "Sameer", isSelf: false, linkedUserId: null };
const empty = { youOwe: [], youAreOwed: [], others: [], simplified: [] };
const book: ShareBook = {
  self,
  people: [self, anita, sameer],
  groups: [{ id: "dinner", name: "Dinner", kind: "group", members: [self, anita, sameer], balances: empty }],
  joinedGroups: [],
  overall: empty,
  expenses: [],
  settlements: [],
  links: [],
};
const schema = expenseInput("2026-10-13");
const receipt = {
  description: "Dinner receipt",
  items: [
    { description: "Food", amount: 300, splitWith: ["Anita", "Sameer"] },
    { description: "Drinks", amount: 200, split: [{ person: "Anita" }, { person: "Sameer" }] },
  ],
};

test("item participants differ, the payer can owe zero for a line, and totals are exact", () => {
  const draft = schema.parse(receipt);
  expect(draft.amount).toBe(500);
  const plan = planExpense(book, draft);
  expect(plan.write.splitMode).toBe("exact");
  expect(Object.fromEntries(plan.splits.map((share) => [share.personId, share.amount]))).toEqual({
    self: 100,
    anita: 200,
    sameer: 200,
  });
  expect(plan.write.items?.[1]?.splits.find((share) => share.personId === "self")?.amount).toBe(0);
  validateExpenseItems(plan.write.items!, plan.write.amount, plan.splits);
});

test("equal, weighted, percent and exact items reconcile at paisa precision", () => {
  const plan = planExpense(
    book,
    schema.parse({
      description: "Small receipt",
      group: "Dinner",
      items: [
        { description: "Odd paisa", amount: 0.01 },
        {
          description: "Weighted",
          amount: 100,
          splitMode: "shares",
          split: [
            { person: "me", value: 2 },
            { person: "Anita", value: 1 },
          ],
        },
        {
          description: "Percent",
          amount: 100,
          splitMode: "percent",
          split: [
            { person: "me", value: 20 },
            { person: "Anita", value: 80 },
          ],
        },
        {
          description: "Exact",
          amount: 100,
          splitMode: "exact",
          split: [
            { person: "me", value: 70 },
            { person: "Sameer", value: 30 },
          ],
        },
      ],
    }),
  );
  expect(Math.round(plan.splits.reduce((total, share) => total + share.amount, 0) * 100)).toBe(30001);
  validateExpenseItems(plan.write.items!, plan.write.amount, plan.splits);
});

test("mismatched totals, mixed instructions, unknown participants and invalid exact shares are refused", () => {
  expect(() => planExpense(book, schema.parse({ ...receipt, amount: 501 }))).toThrow(/add up/);
  expect(schema.safeParse({ ...receipt, splitWith: ["Anita"] }).success).toBe(false);
  expect(() =>
    planExpense(
      book,
      schema.parse({ description: "Unknown", items: [{ description: "Food", amount: 10, splitWith: ["Nobody"] }] }),
    ),
  ).toThrow();
  expect(() =>
    planExpense(
      book,
      schema.parse({
        description: "Bad",
        items: [{ description: "Food", amount: 10, splitMode: "exact", split: [{ person: "me", value: 9 }] }],
      }),
    ),
  ).toThrow(/add up/);
  expect(() =>
    planExpense(
      book,
      schema.parse({ description: "Missing participants", items: [{ description: "Food", amount: 10 }] }),
    ),
  ).toThrow(/Each item/);
});

test("stored item details cannot disagree with overall shares or contain duplicate people", () => {
  const plan = planExpense(book, schema.parse(receipt));
  expect(() => validateExpenseItems(plan.write.items!, 500, [{ personId: "self", amount: 500 }])).toThrow(
    /overall shares/,
  );
  const item = plan.write.items![0]!;
  expect(() =>
    validateExpenseItems([{ ...item, splits: [...item.splits, item.splits[0]!] }], 500, plan.splits),
  ).toThrow(/twice/);
});

test("new keys default to read/write; read access is required and expiry is bounded", () => {
  expect(keyInput.parse({ name: "Bot" }).scopes).toEqual(["read", "write"]);
  expect(keyInput.parse({ name: "Reader", scopes: ["read"], expiresInDays: 30 }).expiresInDays).toBe(30);
  expect(keyInput.safeParse({ name: "Bot", scopes: ["delete"] }).success).toBe(false);
  expect(keyInput.safeParse({ name: "Bot", expiresInDays: 366 }).success).toBe(false);
});
