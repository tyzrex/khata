import type { NextRequest } from "next/server";
import { createPerson } from "@/db/shares";
import { badRequest, beginRequest, shareError } from "@/lib/http";
import { personWriteSchema, shareIssue } from "@/lib/share-schemas";

export async function POST(request: NextRequest) {
  await beginRequest();
  try {
    const parsed = personWriteSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(shareIssue(parsed.error));
    const person = await createPerson(parsed.data.name);
    return Response.json({ person }, { status: 201 });
  } catch (error) {
    return shareError(error);
  }
}
