import type { NextRequest } from "next/server";
import { deleteCategory, isUniqueViolation, updateCategory } from "@/db/ledger";
import { badRequest, beginRequest, jsonError } from "@/lib/http";
import { categorySchema, issueMessage } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  await beginRequest();
  try {
    const { id } = await context.params;
    const parsed = categorySchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(issueMessage(parsed.error));
    const category = await updateCategory(id, parsed.data);
    if (!category) return Response.json({ error: "That category is gone." }, { status: 404 });
    return Response.json({ category });
  } catch (error) {
    if (isUniqueViolation(error)) return Response.json({ error: "A category with that name already exists." }, { status: 409 });
    return jsonError(error);
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  await beginRequest();
  try {
    const { id } = await context.params;
    const result = await deleteCategory(id);
    if (result.status === "missing") return Response.json({ error: "That category is gone." }, { status: 404 });
    if (result.status === "used") {
      return Response.json(
        { error: `${result.name} is still used by entries. Rename it, or move those entries first.` },
        { status: 409 },
      );
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
