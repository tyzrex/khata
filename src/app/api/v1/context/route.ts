import { ok } from "@/server/agent-http";
import { defineAgentRoute } from "@/server/route";
import { contextView } from "@/server/services/agent/context";

/** Everything an agent needs to resolve names and pick values, in one call. */
export const { GET } = defineAgentRoute()({
  GET: { auth: "agent", handle: async ({ userId }) => {
    const view = await contextView(userId);
    return ok(view.data, view.message);
  } },
});
