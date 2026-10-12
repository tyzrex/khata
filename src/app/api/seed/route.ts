import { defineRoute } from "@/server/route";
import { seedSampleData } from "@/server/services/ledger";
import { limits } from "@/server/request-guard";

export const { POST } = defineRoute()({
  POST: {
    limit: { limiter: limits.bulkWrites, key: ({ userId }) => userId, message: (retryAfter) => `Too many sample books. Try again in ${retryAfter} seconds.` },
    handle: async ({ userId }) => Response.json(await seedSampleData(userId)),
  },
});
