import { ok } from "@/server/agent-http";
import { defineAgentRoute } from "@/server/route";
import { addExpense, listExpenses } from "@/server/services/agent/expenses";
import { expenseInput, expenseQuery } from "@/server/agent/schemas";
import { limits } from "@/server/request-guard";
import { todayInKathmandu } from "@/lib/period";

const agentWrite = { limiter: limits.agentWrites, key: ({ userId }: { userId: string }) => userId, message: (retryAfter: number) => `Too many writes. Try again in ${retryAfter} seconds.` };

export const { GET, POST } = defineAgentRoute()({
  GET: {
    auth: "agent",
    query: expenseQuery,
    handle: async ({ userId, query }) => {
      const view = await listExpenses(userId, query);
      return ok(view.data, view.message);
    },
  },
  /** Adds a shared expense by names. See the OpenAPI spec for how `splitWith`, `excludeMe` and `split` combine. */
  POST: {
    auth: "agent",
    body: () => expenseInput(todayInKathmandu()),
    limit: agentWrite,
    handle: async ({ userId, body, viaApiKey }) => {
      const view = await addExpense(userId, body, viaApiKey);
      return ok(view.data, view.message, view.status);
    },
  },
});
