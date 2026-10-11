import { z } from "zod";

/**
 * Form shapes for getting back into an account. Kept apart from `schemas.ts`
 * because they are about the session, not the ledger, and because the reset
 * screen is the only thing that ever imports them.
 */

/** The address to send a reset link to. The server never says whether it exists. */
export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address"),
});

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

/**
 * Choosing a new password. The length rules mirror `emailAndPassword` in auth.ts,
 * because a form that accepts something the server rejects is a bad error message.
 */
export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters").max(128, "Password is too long"),
    confirm: z.string(),
  })
  .refine((values) => values.confirm === values.password, { path: ["confirm"], message: "The two passwords do not match" });

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
