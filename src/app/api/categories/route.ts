import type { NextRequest } from "next/server";
import { createCategory, isUniqueViolation, listCategories } from "@/db/ledger";
import { badRequest, jsonError } from "@/lib/http";
import { categorySchema, issueMessage } from "@/lib/schemas";
import { requireUserId } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    return Response.json({ categories: await listCategories(userId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const parsed = categorySchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(issueMessage(parsed.error));
    const category = await createCategory(userId, parsed.data);
    return Response.json({ category }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return Response.json({ error: "A category with that name already exists." }, { status: 409 });
    return jsonError(error);
  }
}
