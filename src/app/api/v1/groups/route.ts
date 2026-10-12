import { ok } from "@/server/agent-http";
import { defineAgentRoute } from "@/server/route";
import { createNewGroup, listGroups } from "@/server/services/agent/groups";
import { groupInput } from "@/server/agent/schemas";
import { limits } from "@/server/request-guard";

const agentWrite = { limiter: limits.agentWrites, key: ({ userId }: { userId: string }) => userId, message: (retryAfter: number) => `Too many writes. Try again in ${retryAfter} seconds.` };

export const { GET, POST } = defineAgentRoute()({
  GET: { auth: "agent", handle: async ({ userId }) => {
    const view = await listGroups(userId);
    return ok(view.data, view.message);
  } },
  /** Creates a group you own. You are always a member. */
  POST: {
    auth: "agent",
    body: groupInput,
    limit: agentWrite,
    handle: async ({ userId, body }) => {
      const view = await createNewGroup(userId, body);
      return ok(view.data, view.message, view.status);
    },
  },
});
