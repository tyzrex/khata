import assert from "node:assert/strict";
import test from "node:test";
import { relativeTime } from "./relative-time";

const NOW = Date.parse("2026-03-10T12:00:00.000Z");
const ago = (milliseconds: number) => new Date(NOW - milliseconds).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test("says nothing for the first minute rather than counting seconds", () => {
  assert.equal(relativeTime(ago(0), NOW), "just now");
  assert.equal(relativeTime(ago(30_000), NOW), "just now");
});

test("counts whole minutes, hours, then days", () => {
  assert.equal(relativeTime(ago(5 * MINUTE), NOW), "5m ago");
  assert.equal(relativeTime(ago(59 * MINUTE), NOW), "59m ago");
  assert.equal(relativeTime(ago(HOUR), NOW), "1h ago");
  assert.equal(relativeTime(ago(23 * HOUR), NOW), "23h ago");
  assert.equal(relativeTime(ago(DAY), NOW), "1d ago");
});

test("truncates rather than rounds, so an age never reads as further along than it is", () => {
  // Rounding would report "2h ago" at 119 minutes, which is ahead of the truth.
  assert.equal(relativeTime(ago(119 * MINUTE), NOW), "1h ago");
  assert.equal(relativeTime(ago(90 * MINUTE), NOW), "1h ago");
});

test("gives up past a week so the caller can show a real date", () => {
  // Entries are retained for 90 days, so "3mo ago" is a real case, not a hypothetical.
  assert.equal(relativeTime(ago(7 * DAY + MINUTE), NOW), null);
  assert.equal(relativeTime(ago(90 * DAY), NOW), null);
});

test("gives up for a stamp in the future", () => {
  // A device clock running behind the server's would otherwise render a negative age.
  assert.equal(relativeTime(ago(-5 * MINUTE), NOW), null);
});

test("gives up for an unparseable stamp instead of rendering NaN", () => {
  assert.equal(relativeTime("not-a-date", NOW), null);
  assert.equal(relativeTime("", NOW), null);
});
