import { defineRoute } from "@/server/route";
import { importLedger } from "@/server/services/ledger";
import { limits } from "@/server/request-guard";

export const { POST } = defineRoute()({
  POST: {
    // Validated per row by the importer, so a partly readable file still saves.
    rawBody: true,
    limit: { limiter: limits.bulkWrites, key: ({ userId }) => userId, message: (retryAfter) => `Too many imports. Try again in ${retryAfter} seconds.` },
    handle: async ({ userId, body }) => Response.json(await importLedger(userId, body)),
  },
});
