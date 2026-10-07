import type { NextRequest } from "next/server";
import { z } from "zod";
import { createGroupInvite } from "@/db/invites";
import { badRequest, shareError } from "@/lib/http";
import { appOrigin } from "@/lib/app-origin";
import { sendInviteEmail } from "@/lib/invite-email";
import { requireUserId } from "@/lib/session";

const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").optional(),
  personId: z.string().trim().min(1).optional(),
});

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");
    const invite = await createGroupInvite(userId, id, parsed.data);
    const url = `${appOrigin(request)}/invite/${invite.token}`;
    const emailSent = parsed.data.email
      ? await sendInviteEmail({ to: parsed.data.email, inviterName: invite.inviterName, groupName: invite.groupName, url })
      : false;
    return Response.json({ url, expiresAt: invite.expiresAt, emailSent }, { status: 201 });
  } catch (error) {
    return shareError(error);
  }
}
