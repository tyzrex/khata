import { ok } from "@/server/agent-http";
import { defineAgentRoute } from "@/server/route";
import { recordPayment } from "@/server/services/agent/settlements";
import { settlementInput } from "@/server/agent/schemas";
import { limits } from "@/server/request-guard";
import { todayInKathmandu } from "@/lib/period";

const agentWrite = { limiter: limits.agentWrites, key: ({ userId }: { userId: string }) => userId, message: (retryAfter: number) => `Too many writes. Try again in ${retryAfter} seconds.` };

/** Records a payment that settles some or all of a balance. It does not touch the bank ledger. */
export const { POST } = defineAgentRoute()({
  POST: {
    auth: "agent",
    body: () => settlementInput(todayInKathmandu()),
    limit: agentWrite,
    handle: async ({ userId, body, viaApiKey }) => {
      const view = await recordPayment(userId, body, viaApiKey);
      return ok(view.data, view.message, view.status);
    },
  },
});
