import assert from "node:assert/strict";
import test from "node:test";
import { createFeedHub, feedFrame, type FeedEvent } from "@/server/notification-stream";

/**
 * The live feed carries no data — it says "your feed moved" and the browser
 * refetches. That makes the fan-out the whole security surface of the feature:
 * an event delivered to the wrong account tells one person that a shared expense,
 * a group invite, or an open balance exists in a book they have no part of.
 */

test("an event reaches the account it names and nobody else", () => {
  const hub = createFeedHub();
  const mine: FeedEvent[] = [];
  const theirs: FeedEvent[] = [];
  hub.listen("user-a", (event) => mine.push(event));
  hub.listen("user-b", (event) => theirs.push(event));

  hub.dispatch({ userId: "user-a", kind: "created", activity: true });

  assert.equal(mine.length, 1);
  assert.equal(theirs.length, 0);
});

test("two tabs of one account both hear about it", () => {
  const hub = createFeedHub();
  const first: FeedEvent[] = [];
  const second: FeedEvent[] = [];
  hub.listen("user-a", (event) => first.push(event));
  hub.listen("user-a", (event) => second.push(event));

  hub.dispatch({ userId: "user-a", kind: "read" });

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
});

test("a closed tab stops being told anything", () => {
  const hub = createFeedHub();
  const seen: FeedEvent[] = [];
  const close = hub.listen("user-a", (event) => seen.push(event));

  close();
  hub.dispatch({ userId: "user-a", kind: "created" });

  assert.deepEqual(seen, []);
  assert.equal(hub.size, 0, "a watcher left behind would keep every future event alive for nobody");
});

test("a frame ends with the blank line, without which the browser never dispatches it", () => {
  const frame = feedFrame({ activity: true });
  assert.equal(frame, 'event: feed\ndata: {"activity":true}\n\n');
  assert.ok(frame.endsWith("\n\n"));
});

test("a frame says whether the balances moved with it", () => {
  assert.equal(feedFrame({ activity: false }), 'event: feed\ndata: {"activity":false}\n\n');
});