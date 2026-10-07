import type { NextRequest } from "next/server";
import { createPerson } from "@/db/shares";
import { badRequest, shareError } from "@/lib/http";
import { personWriteSchema, shareIssue } from "@/lib/share-schemas";
import { requireUserId } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const parsed = personWriteSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(shareIssue(parsed.error));
    const person = await createPerson(userId, parsed.data.name);
    return Response.json({ person }, { status: 201 });
  } catch (error) {
    return shareError(error);
  }
}
