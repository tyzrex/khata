/** Names are user-typed; keep them on one line and short so they cannot reshape the subject. */
export function oneLine(value: string, max = 80) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
}

const DEFAULT_FROM = "Khata <onboarding@resend.dev>";

/** A display name that is safe inside a quoted From header. */
function displayName(value: string) {
  return oneLine(value, 60).replace(/["<>\\]/g, "");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * `"Asha via Khata" <invites@domain>`: Gmail weighs a person's name in the sender far
 * above a brand name when it decides between Primary and Promotions. The address
 * stays the verified one from INVITE_FROM_EMAIL so SPF and DKIM still line up.
 */
export function inviteSender(inviterName: string, configured = process.env.INVITE_FROM_EMAIL || DEFAULT_FROM) {
  const address = configured.match(/<([^>]+)>/)?.[1]?.trim() ?? configured.trim();
  const name = displayName(inviterName);
  return name ? `"${name} via Khata" <${address}>` : `Khata <${address}>`;
}

export type InviteEmailInput = {
  to: string;
  inviterName: string;
  inviterEmail?: string | null;
  groupName: string;
  direct?: boolean;
  url: string;
};

/**
 * The message is written like a note from the friend, not a campaign: one link, no
 * images, no buttons, no tracking, no unsubscribe footer. Those are the marks bulk
 * mail carries, and they are what push an invite into Promotions.
 */
export function buildInviteEmail(raw: InviteEmailInput) {
  const inviterName = oneLine(raw.inviterName) || "A friend";
  const groupName = oneLine(raw.groupName);
  const subject = raw.direct ? `${inviterName} shared an expense book with you` : `${inviterName} added you to ${groupName}`;
  const lead = raw.direct
    ? `${inviterName} started a shared expense book with you on Khata, so the two of you can keep track of who paid for what.`
    : `${inviterName} added you to "${groupName}" on Khata, so everyone in the group can see shared expenses and who owes whom.`;
  const action = "Open this link and sign in (or create an account) with this email address to join:";
  const closing = "The link works for 7 days. If you weren't expecting this, you can ignore it.";

  const text = [`Hi,`, ``, lead, ``, action, raw.url, ``, closing].join("\n");

  // Plain markup that renders like a hand-written mail in every client. No <style>, no tables for layout.
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f1f23;">
<div style="max-width:520px;">
<p style="margin:0 0 14px;">Hi,</p>
<p style="margin:0 0 14px;">${escapeHtml(lead)}</p>
<p style="margin:0 0 14px;">${escapeHtml(action)}<br><a href="${escapeHtml(raw.url)}" style="color:#1a56db;">${escapeHtml(raw.url)}</a></p>
<p style="margin:0;color:#5f5f66;">${escapeHtml(closing)}</p>
</div>
</body>
</html>`;

  const replyTo = raw.inviterEmail?.trim() || undefined;
  return { subject, text, html, from: inviteSender(inviterName), replyTo };
}

export async function sendInviteEmail(raw: InviteEmailInput) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const email = buildInviteEmail(raw);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: email.from,
        to: [raw.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        // Replies go to the friend who sent the invite: a real conversation, not a no-reply blast.
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        // A unique id keeps Gmail from threading separate invites into one conversation.
        headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
      }),
    });
    // Log the status only: the provider's body can echo the recipient and the invite link.
    if (!response.ok) console.error("Invite email failed", response.status);
    return response.ok;
  } catch (error) {
    console.error("Invite email failed", error instanceof Error ? error.message : "unknown error");
    return false;
  }
}
