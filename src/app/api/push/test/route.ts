import { defineRoute } from "@/server/route";
import { runTestNotification } from "@/server/services/push-subscriptions";
import { limits } from "@/server/request-guard";

/** Sends a test push to every browser registered on this account. Rate limited. */
export const { POST } = defineRoute()({
  POST: {
    limit: { limiter: limits.pushTests, key: ({ userId }) => userId, message: (retryAfter) => `Too many test notifications. Try again in ${retryAfter} seconds.` },
    handle: async ({ userId }) => Response.json(await runTestNotification(userId)),
  },
});
