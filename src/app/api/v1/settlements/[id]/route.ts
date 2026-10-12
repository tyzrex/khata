import { ok } from "@/server/agent-http";
import { defineAgentRoute } from "@/server/route";
import { deletePayment } from "@/server/services/agent/settlements";
import { limits } from "@/server/request-guard";

type Context = { id: string };

export const { DELETE } = defineAgentRoute<Context>()({
  DELETE: {
    auth: "agent",
    limit: { limiter: limits.agentWrites, key: ({ userId }) => userId, message: (retryAfter) => `Too many writes. Try again in ${retryAfter} seconds.` },
    handle: async ({ userId, params, viaApiKey }) => {
      const view = await deletePayment(userId, params.id, viaApiKey);
      return ok(view.data, view.message);
    },
  },
});
