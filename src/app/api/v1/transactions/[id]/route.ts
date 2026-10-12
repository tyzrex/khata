import { ok } from "@/server/agent-http";
import { defineAgentRoute } from "@/server/route";
import { deleteEntry, editEntry, readEntry } from "@/server/services/agent/transactions";
import { transactionPatch } from "@/server/agent/schemas";
import { limits } from "@/server/request-guard";
import { todayInKathmandu } from "@/lib/period";

type Context = { id: string };

const agentWrite = { limiter: limits.agentWrites, key: ({ userId }: { userId: string }) => userId, message: (retryAfter: number) => `Too many writes. Try again in ${retryAfter} seconds.` };

export const { GET, PATCH, DELETE } = defineAgentRoute<Context>()({
  GET: { auth: "agent", handle: async ({ userId, params }) => {
    const view = await readEntry(userId, params.id);
    return ok(view.data, view.message);
  } },
  /** Change only the fields sent; the rest keep their current values. */
  PATCH: {
    auth: "agent",
    body: () => transactionPatch(todayInKathmandu()),
    limit: agentWrite,
    handle: async ({ userId, params, body }) => {
      const view = await editEntry(userId, params.id, body);
      return ok(view.data, view.message);
    },
  },
  DELETE: {
    auth: "agent",
    limit: agentWrite,
    handle: async ({ userId, params }) => {
      const view = await deleteEntry(userId, params.id);
      return ok(view.data, view.message);
    },
  },
});
