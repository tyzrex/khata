import type { NextRequest } from "next/server";
import { deleteSettlement } from "@/db/shares";
import { agentError, ok, spendWrite } from "@/lib/agent/respond";
import { requireAgentUserId } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const userId = await requireAgentUserId(request);
    const limited = spendWrite(userId);
    if (limited) return limited;
    const { id } = await context.params;
    await deleteSettlement(userId, id);
    return ok({ id }, "Payment removed. Balances are updated.");
  } catch (error) {
    return agentError(error);
  }
}
