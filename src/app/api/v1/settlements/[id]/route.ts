import type { NextRequest } from "next/server";
import { deleteSettlement, describeSharedWrite } from "@/db/shares";
import { agentError, ok, spendWrite } from "@/lib/agent/respond";
import { notifySharedWrite } from "@/lib/push-notifications";
import { requireAgentUserId } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const userId = await requireAgentUserId(request);
    const limited = spendWrite(userId);
    if (limited) return limited;
    const { id } = await context.params;
    // Settlements keep no audit trail, so snapshot the push detail before the row goes.
    const detail = await describeSharedWrite(userId, { kind: "settlement", action: "deleted", settlementId: id });
    await deleteSettlement(userId, id);
    if (detail) notifySharedWrite({ ...detail, activity: { ...detail.activity, action: "deleted" } });
    return ok({ id }, "Payment removed. Balances are updated.");
  } catch (error) {
    return agentError(error);
  }
}
