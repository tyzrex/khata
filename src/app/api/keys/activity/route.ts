import { listAgentOperations } from "@/db/agent-operations";
import { defineRoute } from "@/server/route";
export const { GET } = defineRoute()({
  GET: { handle: async ({ userId }) => Response.json({ operations: await listAgentOperations(userId, 20) }) },
});
