import { ok } from "@/server/agent-http";
import { defineAgentRoute } from "@/server/route";
import { listPayments, recordPayment } from "@/server/services/agent/settlements";
import { z } from "zod";
import { dateSchema } from "@/lib/schemas";
import { settlementInput } from "@/server/agent/schemas";
import { limits } from "@/server/request-guard";
import { todayInKathmandu } from "@/lib/period";
import { idempotencyKeyOf, once, withoutDate } from "@/server/idempotency";

const agentWrite = { limiter: limits.agentWrites, key: ({ userId }: { userId: string }) => userId, message: (retryAfter: number) => `Too many writes. Try again in ${retryAfter} seconds.` };

/** Records a payment that settles some or all of a balance. It does not touch the bank ledger. */
export const { GET, POST } = defineAgentRoute()({
  GET: { auth: "agent", query: z.object({ group: z.string().max(100).optional(), from: dateSchema.optional(), to: dateSchema.optional(), limit: z.coerce.number().int().min(1).max(200).optional() }), handle: async ({ userId, query }) => {
    const view = await listPayments(userId, query);
    return ok(view.data, view.message);
  } },
  POST: {
    auth: "agent",
    body: () => settlementInput(todayInKathmandu()),
    limit: agentWrite,
    handle: async ({ request, userId, body, viaApiKey }) => {
      const { result: view, replayed } = await once(userId, "settlement", idempotencyKeyOf(request, body.externalId), withoutDate(body), () => recordPayment(userId, body, viaApiKey));
      return replayed ? ok(view.data, `${view.message} (This was already recorded; nothing was added.)`, 200) : ok(view.data, view.message, view.status);
    },
  },
});
