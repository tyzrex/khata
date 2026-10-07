import type { NextRequest } from "next/server";
import { createCategory, isUniqueViolation, listCategories } from "@/db/ledger";
import { badRequest, beginRequest, jsonError } from "@/lib/http";
import { categorySchema, issueMessage } from "@/lib/schemas";

export async function GET() {
  await beginRequest();
  try {
    return Response.json({ categories: await listCategories() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  await beginRequest();
  try {
    const parsed = categorySchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(issueMessage(parsed.error));
    const category = await createCategory(parsed.data);
    return Response.json({ category }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return Response.json({ error: "A category with that name already exists." }, { status: 409 });
    return jsonError(error);
  }
}
