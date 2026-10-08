import type { NextRequest } from "next/server";
import { ensureDirectGroup } from "@/db/shares";
import { shareError } from "@/lib/http";
import { requireUserId } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

/** Find or create the hidden two-person book between you and this friend. */
export async function POST(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const groupId = await ensureDirectGroup(userId, id);
    return Response.json({ id: groupId });
  } catch (error) {
    return shareError(error);
  }
}
