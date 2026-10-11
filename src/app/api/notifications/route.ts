import { z } from "zod";
import { badRequest, jsonError, readJson, shareError } from "@/lib/http";
import { getFeed, markFeedRead } from "@/lib/notifications-service";
import { requireUserId } from "@/lib/session";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  before: z.string().min(1).max(64).optional(),
});

const patchSchema = z
  .object({
    ids: z.array(z.string().min(1).max(64)).max(100).optional(),
    all: z.boolean().optional(),
  })
  .refine((value) => value.all === true || (value.ids?.length ?? 0) > 0, "Nothing to mark as read.");

/** GET reads a page of the in-app feed; PATCH marks entries read. */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "That request is not valid.");
    return Response.json(await getFeed(userId, parsed.data));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId(request);
    const parsed = patchSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "That request is not valid.");
    return Response.json(await markFeedRead(userId, parsed.data));
  } catch (error) {
    return shareError(error);
  }
}
