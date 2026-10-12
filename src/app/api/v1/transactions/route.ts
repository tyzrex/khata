import { ok } from "@/server/agent-http";
import { defineAgentRoute } from "@/server/route";
import { listEntries, saveEntries } from "@/server/services/agent/transactions";
import { transactionQuery } from "@/server/agent/schemas";
import { limits } from "@/server/request-guard";

export const { GET, POST } = defineAgentRoute()({
  GET: {
    auth: "agent",
    query: transactionQuery,
    handle: async ({ userId, query }) => {
      const view = await listEntries(userId, query);
      return ok(view.data, view.message);
    },
  },
  /** One transaction or a batch. Rows carrying an externalId are upserted, so a retry is safe. */
  POST: {
    auth: "agent",
    rawBody: true,
    limit: { limiter: limits.agentWrites, key: ({ userId }) => userId, message: (retryAfter) => `Too many writes. Try again in ${retryAfter} seconds.` },
    handle: async ({ userId, body }) => {
      const view = await saveEntries(userId, body);
      return ok(view.data, view.message, view.status);
    },
  },
});
