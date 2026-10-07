import type { NextRequest } from "next/server";
import { createSettlement } from "@/db/shares";
import { badRequest, beginRequest, shareError } from "@/lib/http";
import { settlementWriteSchema, shareIssue } from "@/lib/share-schemas";

export async function POST(request: NextRequest) {
  await beginRequest();
  try {
    const parsed = settlementWriteSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(shareIssue(parsed.error));
    const id = await createSettlement(parsed.data);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return shareError(error);
  }
}
