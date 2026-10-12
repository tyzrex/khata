import { z } from "zod";
import { defineRoute } from "@/server/route";
import { savePreferences } from "@/server/services/push-subscriptions";

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
export const { PATCH } = defineRoute()({
  PATCH: { snapshot: false, body: preferencesSchema, handle: async ({ userId, body }) => Response.json({ preferences: await savePreferences(userId, body) }) },
});
