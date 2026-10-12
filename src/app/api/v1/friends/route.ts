import { ok } from "@/server/agent-http";
import { defineAgentRoute } from "@/server/route";
import { addFriends, listFriends } from "@/server/services/agent/friends";
import { friendInput } from "@/server/agent/schemas";
import { limits } from "@/server/request-guard";

const agentWrite = { limiter: limits.agentWrites, key: ({ userId }: { userId: string }) => userId, message: (retryAfter: number) => `Too many writes. Try again in ${retryAfter} seconds.` };

export const { GET, POST } = defineAgentRoute()({
  GET: { auth: "agent", handle: async ({ userId }) => {
    const view = await listFriends(userId);
    return ok(view.data, view.message);
  } },
  /** Adds friends by name. A name that already exists is returned as is, so retrying is safe. */
  POST: {
    auth: "agent",
    body: friendInput,
    limit: agentWrite,
    handle: async ({ userId, body }) => {
      const view = await addFriends(userId, body);
      return ok(view.data, view.message, view.status);
    },
  },
});
