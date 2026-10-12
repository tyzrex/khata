import { createApiKey, listApiKeys } from "@/db/api-keys";
import { defineRoute } from "@/server/route";
import { keyInput } from "@/server/agent/schemas";
import { limits } from "@/server/request-guard";

/** Key management needs a signed-in session: an API key cannot mint or list other keys. */
export const { GET, POST } = defineRoute()({
  GET: { handle: async ({ userId }) => Response.json({ keys: await listApiKeys(userId) }) },
  POST: {
    snapshot: false,
    body: keyInput,
    limit: { limiter: limits.apiKeys, key: ({ userId }) => userId, message: (retryAfter) => `Too many keys created. Try again in ${retryAfter} seconds.` },
    handle: async ({ userId, body }) => Response.json(await createApiKey(userId, body.name), { status: 201 }),
  },
});
