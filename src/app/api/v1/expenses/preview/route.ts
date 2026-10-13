import { defineAgentRoute } from "@/server/route";
import { ok } from "@/server/agent-http";
import { expenseInput } from "@/server/agent/schemas";
import { previewExpense } from "@/server/services/agent/expenses";
import { todayInKathmandu } from "@/lib/period";

export const { POST } = defineAgentRoute()({
  POST: { auth: "agent", scope: "read", snapshot: false, body: () => expenseInput(todayInKathmandu()), handle: async ({ userId, body }) => {
    const view = await previewExpense(userId, body);
    return ok(view.data, view.message);
  } },
});
