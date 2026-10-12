import assert from "node:assert/strict";
import { mock, test } from "bun:test";
import { ConflictError } from "./errors";

/** An in-memory stand-in for the table, with the same claim / complete / release behaviour. */
const rows = new Map<string, { fingerprint: string; response: unknown | null }>();
mock.module("@/db/idempotency", () => ({
  claimIdempotencyKey: async (userId: string, key: string, fingerprint: string) => {
    const id = `${userId}|${key}`;
    const row = rows.get(id);
    if (!row) {
      rows.set(id, { fingerprint, response: null });
      return { claimed: true };
    }
    return { claimed: false, fingerprint: row.fingerprint, response: row.response };
  },
  completeIdempotencyKey: async (userId: string, key: string, response: unknown) => {
    rows.get(`${userId}|${key}`)!.response = response;
  },
  releaseIdempotencyKey: async (userId: string, key: string) => {
    const row = rows.get(`${userId}|${key}`);
    if (row && row.response === null) rows.delete(`${userId}|${key}`);
  },
}));

const { once, idempotencyKeyOf, withoutDate } = await import("./idempotency");

test("the same key runs the write once and replays the first answer", async () => {
  rows.clear();
  let writes = 0;
  const run = async () => ({ id: `expense-${++writes}` });
  const first = await once("u1", "expense", "k1", { amount: 800 }, run);
  const second = await once("u1", "expense", "k1", { amount: 800 }, run);
  assert.deepEqual(first, { result: { id: "expense-1" }, replayed: false });
  assert.deepEqual(second, { result: { id: "expense-1" }, replayed: true });
  assert.equal(writes, 1);
});

test("no key means no deduplication", async () => {
  rows.clear();
  let writes = 0;
  await once("u1", "expense", null, {}, async () => ++writes);
  await once("u1", "expense", null, {}, async () => ++writes);
  assert.equal(writes, 2);
});

test("keys are per user and per scope", async () => {
  rows.clear();
  let writes = 0;
  const run = async () => ++writes;
  await once("u1", "expense", "k", { a: 1 }, run);
  await once("u2", "expense", "k", { a: 1 }, run);
  await once("u1", "settlement", "k", { a: 1 }, run);
  assert.equal(writes, 3);
});

test("reusing a key for a different request is refused, not answered", async () => {
  rows.clear();
  await once("u1", "expense", "k", { amount: 800 }, async () => "ok");
  await assert.rejects(() => once("u1", "expense", "k", { amount: 900 }, async () => "ok"), ConflictError);
});

test("a failed write releases the key so the retry really runs", async () => {
  rows.clear();
  await assert.rejects(() => once("u1", "expense", "k", {}, async () => { throw new Error("boom"); }), /boom/);
  const retry = await once("u1", "expense", "k", {}, async () => "saved");
  assert.deepEqual(retry, { result: "saved", replayed: false });
});

test("the header wins over the body key, and the date is not part of a request's identity", () => {
  const request = new Request("http://x", { headers: { "idempotency-key": "  from-header " } });
  assert.equal(idempotencyKeyOf(request, "from-body"), "from-header");
  assert.equal(idempotencyKeyOf(new Request("http://x"), "from-body"), "from-body");
  assert.equal(idempotencyKeyOf(new Request("http://x")), null);
  assert.deepEqual(withoutDate({ date: "2026-10-08", amount: 5 }), { amount: 5 });
});
