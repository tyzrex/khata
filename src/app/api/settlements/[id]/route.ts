import type { NextRequest } from "next/server";
import { deleteSettlement, describeSharedWrite, updateSettlement } from "@/db/shares";
import { badRequest, readJson, shareError } from "@/lib/http";
import { notifySharedWrite } from "@/lib/push-notifications";
import { settlementWriteSchema, shareIssue } from "@/lib/share-schemas";
import { requireUserId } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const parsed = settlementWriteSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(shareIssue(parsed.error));
    await updateSettlement(userId, id, parsed.data);
    const detail = await describeSharedWrite(userId, { kind: "settlement", action: "updated", settlementId: id });
    if (detail) notifySharedWrite(detail);
    return Response.json({ id });
  } catch (error) {
    return shareError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    // Settlements keep no audit trail, so snapshot the push detail before the row goes.
    const detail = await describeSharedWrite(userId, { kind: "settlement", action: "deleted", settlementId: id });
    await deleteSettlement(userId, id);
    if (detail) notifySharedWrite({ ...detail, activity: { ...detail.activity, action: "deleted" } });
    return new Response(null, { status: 204 });
  } catch (error) {
    return shareError(error);
  }
}
