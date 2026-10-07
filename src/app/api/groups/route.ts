import type { NextRequest } from "next/server";
import { createGroup } from "@/db/shares";
import { badRequest, beginRequest, shareError } from "@/lib/http";
import { groupWriteSchema, shareIssue } from "@/lib/share-schemas";

export async function POST(request: NextRequest) {
  await beginRequest();
  try {
    const parsed = groupWriteSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(shareIssue(parsed.error));
    const id = await createGroup(parsed.data.name, parsed.data.memberIds);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return shareError(error);
  }
}
