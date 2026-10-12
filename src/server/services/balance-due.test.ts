import { expect, mock, test } from "bun:test";

/**
 * The reminder reconcile is throttled because it reads the whole share book. The throttle
 * was one module-level timestamp, so the first account to poll the feed switched the
 * reconcile off for every other account on that instance for five minutes.
 */

const reads: string[] = [];
mock.module("@/db/shares", () => ({
  getShareBook: async (userId: string) => {
    reads.push(userId);
    return { overall: { youOwe: [], youAreOwed: [], others: [], simplified: [] }, joinedGroups: [] };
  },
}));
mock.module("@/db/notifications", () => ({
  recordNotifications: async () => [],
  retireOtherNotificationsOfKind: async () => undefined,
}));

const { syncBalanceDueNotifications } = await import("@/server/services/balance-due");

test("one account's check does not throttle another's", async () => {
  await syncBalanceDueNotifications("user-a");
  await syncBalanceDueNotifications("user-b");
  expect(reads).toEqual(["user-a", "user-b"]);
});

test("the same account is still throttled", async () => {
  reads.length = 0;
  await syncBalanceDueNotifications("user-a");
  expect(reads).toEqual([]);
});
