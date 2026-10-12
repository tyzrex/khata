import { ok } from "@/server/agent-http";
import { defineAgentRoute } from "@/server/route";
import { deleteExpense, readExpense } from "@/server/services/agent/expenses";
import { limits } from "@/server/request-guard";

type Context = { id: string };

const agentWrite = { limiter: limits.agentWrites, key: ({ userId }: { userId: string }) => userId, message: (retryAfter: number) => `Too many writes. Try again in ${retryAfter} seconds.` };

export const { GET, DELETE } = defineAgentRoute<Context>()({
  GET: { auth: "agent", handle: async ({ userId, params }) => {
    const view = await readExpense(userId, params.id);
    return ok(view.data, view.message);
  } },
  DELETE: {
    auth: "agent",
    limit: agentWrite,
    handle: async ({ userId, params, viaApiKey }) => {
      const view = await deleteExpense(userId, params.id, viaApiKey);
      return ok(view.data, view.message);
    },
  },
});
