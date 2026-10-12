import assert from "node:assert/strict";
import test from "node:test";
import { composeAudience } from "@/server/push";

/**
 * Who hears about a shared write. These are the rules the sharing review found broken:
 * the owner was never told when a collaborator wrote, someone who left a group kept being
 * told, and a friend who was never invited into a group was sent its amounts.
 */

const OWNER = "owner";
const COC = "coc";
const BOB = "bob";
const set = (...ids: string[]) => new Set(ids);
const sorted = (ids: string[]) => [...ids].sort();

test("a member writing into the owner's book tells the owner", () => {
  const { notify } = composeAudience({ actorId: COC, ownerId: OWNER, participants: set(COC), accessHolders: set(OWNER, COC) });
  assert.deepEqual(notify, [OWNER]);
});

test("the owner writing tells the linked member, not themselves", () => {
  const { notify } = composeAudience({ actorId: OWNER, ownerId: OWNER, participants: set(COC), accessHolders: set(OWNER, COC) });
  assert.deepEqual(notify, [COC]);
});

test("someone who left the group is not told about it", () => {
  const { notify, expire } = composeAudience({ actorId: OWNER, ownerId: OWNER, participants: set(COC, BOB), accessHolders: set(OWNER, COC) });
  assert.deepEqual(notify, [COC]);
  assert.ok(!notify.includes(BOB));
  // Their cached screens are still stale if they ever come back, so expiry is broader than notice.
  assert.ok(expire.includes(BOB));
});

test("a linked friend who was never given access is not told about a group expense", () => {
  const { notify } = composeAudience({ actorId: OWNER, ownerId: OWNER, participants: set(BOB), accessHolders: set(OWNER) });
  assert.deepEqual(notify, []);
});

test("a member who is not on the expense is not notified but does have their view expired", () => {
  const { notify, expire } = composeAudience({ actorId: OWNER, ownerId: OWNER, participants: set(COC), accessHolders: set(OWNER, COC, BOB) });
  assert.deepEqual(notify, [COC]);
  assert.deepEqual(sorted(expire), sorted([OWNER, COC, BOB]));
});

test("outside any group the linked participants are told, as before", () => {
  const { notify } = composeAudience({ actorId: OWNER, ownerId: OWNER, participants: set(COC), accessHolders: null });
  assert.deepEqual(notify, [COC]);
});

test("the owner is told even when nobody else is linked", () => {
  const { notify } = composeAudience({ actorId: COC, ownerId: OWNER, participants: set(), accessHolders: null });
  assert.deepEqual(notify, [OWNER]);
});

test("the actor is never in the notify list but is still expired", () => {
  const { notify, expire } = composeAudience({ actorId: COC, ownerId: OWNER, participants: set(COC), accessHolders: set(OWNER, COC) });
  assert.ok(!notify.includes(COC));
  assert.ok(expire.includes(COC));
});
