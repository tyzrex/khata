import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { agentOperations } from "@/db/schema";
import type { AgentIdentity } from "@/lib/agent-permissions";

export async function beginAgentOperation(identity: AgentIdentity, tool: string) {
  const id = crypto.randomUUID();
  await getDb()
    .insert(agentOperations)
    .values({
      id,
      userId: identity.userId,
      apiKeyId: identity.apiKeyId,
      agentName: identity.agentName ?? "Agent",
      tool,
    });
  return id;
}
export async function finishAgentOperation(
  id: string,
  outcome: { status: "succeeded" | "failed"; targetId?: string | null; replayed?: boolean; errorStatus?: number },
) {
  await getDb()
    .update(agentOperations)
    .set({ ...outcome, completedAt: new Date() })
    .where(eq(agentOperations.id, id));
}
export async function listAgentOperations(userId: string, limit = 50, apiKeyId?: string) {
  return getDb()
    .select()
    .from(agentOperations)
    .where(and(eq(agentOperations.userId, userId), apiKeyId ? eq(agentOperations.apiKeyId, apiKeyId) : undefined))
    .orderBy(desc(agentOperations.createdAt))
    .limit(limit);
}
