import { ok } from "@/server/agent-http";
import { defineAgentRoute } from "@/server/route";
import { editGroup, readGroup } from "@/server/services/agent/groups";
import { groupPatch } from "@/server/agent/schemas";
import { limits } from "@/server/request-guard";

type Context = { group: string };

const agentWrite = { limiter: limits.agentWrites, key: ({ userId }: { userId: string }) => userId, message: (retryAfter: number) => `Too many writes. Try again in ${retryAfter} seconds.` };

/** `group` is an id or a group name (Next has already decoded it from the URL). */
export const { GET, PATCH } = defineAgentRoute<Context>()({
  GET: { auth: "agent", handle: async ({ userId, params }) => {
    const view = await readGroup(userId, params.group);
    return ok(view.data, view.message);
  } },
  /** Rename a group you own, or add and remove members by name. */
  PATCH: {
    auth: "agent",
    body: groupPatch,
    limit: agentWrite,
    handle: async ({ userId, params, body }) => {
      const view = await editGroup(userId, params.group, body);
      return ok(view.data, view.message, view.status);
    },
  },
});
