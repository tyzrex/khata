/**
 * Mail that belongs to the signed-in person rather than to a shared expense:
 * confirming a new email address, and confirming they really mean to delete the
 * account. Same Resend transport as invite-email.ts, same rule — if no API key is
 * configured this logs and returns, because a verification link that never lands
 * would leave someone waiting on a click that cannot arrive.
 */

const DEFAULT_FROM = "Khata <onboarding@resend.dev>";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** A bare page with one link in it: no layout, nothing to click but the button. */
function page(heading: string, body: string, action: string, url: string) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f1f3;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1b1b1f">
  <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:18px;padding:28px">
    <h1 style="margin:0 0 12px;font-size:19px;font-weight:600;letter-spacing:-0.02em">${escapeHtml(heading)}</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#74747c">${escapeHtml(body)}</p>
    <a href="${escapeHtml(url)}" style="display:inline-block;background:#1a0fd1;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:11px 18px;border-radius:12px">${escapeHtml(action)}</a>
    <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#a3a3ab;word-break:break-all">If the button does nothing, paste this into your browser:<br>${escapeHtml(url)}</p>
  </div>
</body></html>`;
}

function fromAddress() {
  const configured = process.env.INVITE_FROM_EMAIL?.trim() || DEFAULT_FROM;
  return configured.includes("<") ? configured : `Khata <${configured.replace(/^Khata\s+/, "")}>`;
}

async function send(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error(`Auth email not sent: RESEND_API_KEY is not set (${subject} to ${to}). Set INVITE_FROM_EMAIL too, or this link will never arrive.`);
    return false;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ from: fromAddress(), to: [to], subject, html, headers: { "X-Entity-Ref-ID": crypto.randomUUID() } }),
    });
    if (!response.ok) console.error("Auth email failed", response.status);
    return response.ok;
  } catch (error) {
    console.error("Auth email failed", error instanceof Error ? error.message : "unknown error");
    return false;
  }
}

/** Confirming an address on sign-up, or after changing it. */
export function sendVerificationEmail({ user, url }: { user: { name?: string | null; email: string }; url: string }) {
  return send(
    user.email,
    "Confirm your email for Khata",
    page(
      `Confirm ${user.email}`,
      `Hi ${user.name?.trim() || "there"}. Confirm this address and Khata will use it for sign-in and for anything that needs emailing. If you did not ask for this, ignore this email.`,
      "Confirm email",
      url,
    ),
  );
}

/** Last stop before a person loses their whole ledger. */
export function sendDeleteAccountVerification({ user, url }: { user: { name?: string | null; email: string }; url: string }) {
  return send(
    user.email,
    "Delete your Khata account",
    page(
      "Delete your Khata account?",
      "This permanently deletes your account, every entry, split, settlement and API key. It cannot be undone. Only continue if it was you.",
      "Delete my account",
      url,
    ),
  );
}