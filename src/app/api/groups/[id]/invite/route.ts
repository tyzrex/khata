import type { NextRequest } from "next/server";
import { z } from "zod";
import { createGroupInvite } from "@/db/invites";
import { appOrigin } from "@/lib/app-origin";
import { badRequest, readJson, RequestError, shareError, tooManyRequests } from "@/lib/http";
import { sendInviteEmail } from "@/lib/invite-email";
import { limits } from "@/lib/request-guard";
import { requireUserId } from "@/lib/session";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address").optional(),
  personId: z.string().trim().min(1).max(100).optional(),
});

type Context = { params: Promise<{ id: string }> };

/** The body is optional: an empty POST makes a plain shareable link. */
async function readOptionalJson(request: Request) {
  try {
    return await readJson(request);
  } catch (error) {
    if (error instanceof RequestError && error.status === 400 && error.message === "Send a JSON body.") return {};
    throw error;
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const parsed = inviteSchema.safeParse(await readOptionalJson(request));
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");

    const linkLimit = limits.invites.take(userId);
    if (!linkLimit.ok) return tooManyRequests(linkLimit.retryAfter);
    const email = parsed.data.email;
    if (email) {
      const sender = limits.inviteEmails.take(userId);
      if (!sender.ok) return tooManyRequests(sender.retryAfter);
      const recipient = limits.inviteRecipient.take(email);
      if (!recipient.ok) return tooManyRequests(recipient.retryAfter);
    }

    const invite = await createGroupInvite(userId, id, parsed.data);
    const url = `${appOrigin(request)}/invite/${invite.token}`;
    const emailSent = email ? await sendInviteEmail({ to: email, inviterName: invite.inviterName, groupName: invite.groupName, direct: invite.direct, url }) : false;
    return Response.json({ url, expiresAt: invite.expiresAt, emailSent }, { status: 201 });
  } catch (error) {
    return shareError(error);
  }
}
