import type { NextRequest } from "next/server";
import { createSettlement } from "@/db/shares";
import { badRequest, shareError } from "@/lib/http";
import { settlementWriteSchema, shareIssue } from "@/lib/share-schemas";
import { requireUserId } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const parsed = settlementWriteSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(shareIssue(parsed.error));
    const id = await createSettlement(userId, parsed.data);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return shareError(error);
  }
}
