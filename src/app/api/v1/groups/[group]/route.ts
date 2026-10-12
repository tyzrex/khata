import { ok } from "@/server/agent-http";
import { defineAgentRoute } from "@/server/route";
import { editGroup, readGroup } from "@/server/services/agent/groups";
import { groupPatch } from "@/server/agent/schemas";
import { limits } from "@/server/request-guard";

type Context = { group: string };

const agentWrite = { limiter: limits.agentWrites, key: ({ userId }: { userId: string }) => userId, message: (retryAfter: number) => `Too many writes. Try again in ${retryAfter} seconds.` };

/** `group` is an id or a group name (URL-encoded). */
export const { GET, PATCH } = defineAgentRoute<Context>()({
  GET: { auth: "agent", handle: async ({ userId, params }) => {
    const view = await readGroup(userId, decodeURIComponent(params.group));
    return ok(view.data, view.message);
  } },
  /** Rename a group you own, or add and remove members by name. */
  PATCH: {
    auth: "agent",
    body: groupPatch,
    limit: agentWrite,
    handle: async ({ userId, params, body }) => {
      const view = await editGroup(userId, decodeURIComponent(params.group), body);
      return ok(view.data, view.message, view.status);
    },
  },
});
