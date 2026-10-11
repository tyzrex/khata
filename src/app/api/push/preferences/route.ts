import type { NextRequest } from "next/server";
import { z } from "zod";
import { updateNotificationPreferences } from "@/db/push-notifications";
import { badRequest, jsonError, readJson } from "@/lib/http";
import { requireUserId } from "@/lib/session";

const preferencesSchema = z
  .object({
    expenseActivity: z.boolean().optional(),
    settlementActivity: z.boolean().optional(),
    showAmounts: z.boolean().optional(),
  })
  .refine((value) => value.expenseActivity !== undefined || value.settlementActivity !== undefined || value.showAmounts !== undefined, {
    message: "Nothing to update",
  });

/** Per-account notification toggles, including whether bodies may carry amounts. */
export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const parsed = preferencesSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Those preferences are invalid.");
    return Response.json({ preferences: await updateNotificationPreferences(userId, parsed.data) });
  } catch (error) {
    return jsonError(error);
  }
}
