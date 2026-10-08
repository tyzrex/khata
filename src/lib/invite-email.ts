/** Names are user-typed; keep them on one line and short so they cannot reshape the subject. */
export function oneLine(value: string, max = 80) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
}

export async function sendInviteEmail(raw: { to: string; inviterName: string; groupName: string; direct?: boolean; url: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const input = { ...raw, inviterName: oneLine(raw.inviterName) || "A friend", groupName: oneLine(raw.groupName) };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: process.env.INVITE_FROM_EMAIL ?? "Khata <onboarding@resend.dev>",
        to: [input.to],
        subject: input.direct ? `${input.inviterName} wants to split expenses with you on Khata` : `${input.inviterName} invited you to ${input.groupName} on Khata`,
        text: `${input.direct ? `${input.inviterName} wants to split expenses with you on Khata.` : `${input.inviterName} added you to "${input.groupName}" on Khata so you can split expenses and settle up.`}\n\nCreate an account or sign in with this address to join:\n${input.url}\n\nThe link expires in 7 days.`,
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
