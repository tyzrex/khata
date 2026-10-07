import type { NextRequest } from "next/server";
import { deleteSettlement } from "@/db/shares";
import { shareError } from "@/lib/http";
import { requireUserId } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    await deleteSettlement(userId, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return shareError(error);
  }
}
