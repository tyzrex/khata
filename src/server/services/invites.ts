import { acceptInvite, createGroupInvite, getInviteByToken, type InviteInfo } from "@/db/invites";
import { NotFoundError, RateLimitError } from "@/server/errors";
import { appOrigin } from "@/server/app-origin";
import { expireSnapshots } from "@/server/cache-tags";
import { sendInviteEmail } from "@/server/invite-email";
import { clientIp as ipOf, isInviteToken, limits, type RateLimiter } from "@/server/request-guard";

/**
 * Invites are the one place a write leaves the building: a token becomes a link,
 * and an address the sender typed becomes an outbound email. The limits and the
 * delivery therefore live together here rather than being spread across a route.
 */

export type InviteInput = { email?: string; personId?: string };

export type InviteLink = { url: string; expiresAt: Date; emailSent: boolean };

function spend(limiter: RateLimiter, key: string, message: (retryAfter: number) => string) {
  const taken = limiter.take(key);
  if (!taken.ok) throw new RateLimitError(message(taken.retryAfter), taken.retryAfter);
}

/**
 * Mints a shareable link, and emails it when an address was given.
 *
 * Three separate budgets apply, because they defend against three different
 * things: links created per sender, emails sent per sender (each one goes to an
 * address somebody typed), and emails to any single address across all senders
 * (so one person cannot be used as a relay to spam a stranger).
 */
export async function createInviteLink(userId: string, groupId: string, input: InviteInput, request: Request): Promise<InviteLink> {
  spend(limits.invites, userId, (retryAfter) => `Too many invite links. Try again in ${retryAfter} seconds.`);
  if (input.email) {
    spend(limits.inviteEmails, userId, (retryAfter) => `Too many invite emails. Try again in ${retryAfter} seconds.`);
    spend(limits.inviteRecipient, input.email, (retryAfter) => `That address has already been invited. Try again in ${retryAfter} seconds.`);
  }

  const invite = await createGroupInvite(userId, groupId, input);
  const url = `${appOrigin(request)}/invite/${invite.token}`;
  const emailSent = input.email
    ? await sendInviteEmail({ to: input.email, inviterName: invite.inviterName, inviterEmail: invite.inviterEmail, groupName: invite.groupName, direct: invite.direct, url })
    : false;
  return { url, expiresAt: invite.expiresAt, emailSent };
}

/**
 * Public lookup, so it is limited by caller IP rather than by account. A malformed
 * token is refused on shape alone, before any database read is attempted.
 */
export async function readInvite(request: Request, token: string): Promise<InviteInfo> {
  spend(limits.inviteLookups, ipOf(request.headers), (retryAfter) => `Too many attempts. Try again in ${retryAfter} seconds.`);
  if (!isInviteToken(token)) throw new NotFoundError("This invite link is not valid.");
  const info = await getInviteByToken(token);
  // One message for both, so a caller cannot tell a guessed token from a dead one.
  if (!info) throw new NotFoundError("This invite link is not valid.");
  return info;
}

export async function redeemInvite(request: Request, userId: string, token: string) {
  spend(limits.inviteLookups, ipOf(request.headers), (retryAfter) => `Too many attempts. Try again in ${retryAfter} seconds.`);
  if (!isInviteToken(token)) throw new NotFoundError("This invite link is not valid.");
  const accepted = await acceptInvite(userId, token);
  // Joining puts a new person in somebody else's book, so their roster, their
  // balances and the direct book that just opened are all stale as well.
  expireSnapshots([userId, accepted.ownerId]);
  return accepted;
}