import { ok } from "@/server/agent-http";
import { defineAgentRoute } from "@/server/route";
import { balancesView } from "@/server/services/agent/balances";

/** Who owes whom: overall, per friend, per group, and the fewest payments that settle your own book. */
export const { GET } = defineAgentRoute()({
  GET: { auth: "agent", handle: async ({ userId }) => {
    const view = await balancesView(userId);
    return ok(view.data, view.message);
  } },
});
