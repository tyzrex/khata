import type { NextRequest } from "next/server";
import { createGroup } from "@/db/shares";
import { badRequest, shareError, readJson } from "@/lib/http";
import { groupWriteSchema, shareIssue } from "@/lib/share-schemas";
import { requireUserId } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const parsed = groupWriteSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(shareIssue(parsed.error));
    const id = await createGroup(userId, parsed.data.name, parsed.data.memberIds);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return shareError(error);
  }
}
