import type { NextRequest } from "next/server";
import { deleteSettlement } from "@/db/shares";
import { beginRequest, shareError } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, context: Context) {
  await beginRequest();
  try {
    const { id } = await context.params;
    await deleteSettlement(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return shareError(error);
  }
}
