import { ok } from "@/server/agent-http";
import { defineAgentRoute } from "@/server/route";
import { deletePayment, editPayment, readPayment } from "@/server/services/agent/settlements";
import { z } from "zod";
import { limits } from "@/server/request-guard";

type Context = { id: string };

export const { GET, PATCH, DELETE } = defineAgentRoute<Context>()({
  GET: { auth: "agent", handle: async ({ userId, params }) => {
    const view = await readPayment(userId, params.id);
    return ok(view.data, view.message);
  } },
  PATCH: { auth: "agent", body: z.record(z.string(), z.unknown()), limit: { limiter: limits.agentWrites, key: ({ userId }) => userId }, handle: async ({ userId, params, body, viaApiKey }) => {
    const view = await editPayment(userId, params.id, body, viaApiKey);
    return ok(view.data, view.message);
  } },
  DELETE: {
    auth: "agent",
    limit: { limiter: limits.agentWrites, key: ({ userId }) => userId, message: (retryAfter) => `Too many writes. Try again in ${retryAfter} seconds.` },
    handle: async ({ userId, params, viaApiKey }) => {
      const view = await deletePayment(userId, params.id, viaApiKey);
      return ok(view.data, view.message);
    },
  },
});
