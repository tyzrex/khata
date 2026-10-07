export async function sendInviteEmail(input: { to: string; inviterName: string; groupName: string; url: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.INVITE_FROM_EMAIL ?? "Khata <onboarding@resend.dev>",
        to: [input.to],
        subject: `${input.inviterName} invited you to ${input.groupName} on Khata`,
        text: `${input.inviterName} added you to "${input.groupName}" on Khata so you can split expenses and settle up.\n\nCreate an account or sign in with this address to join:\n${input.url}\n\nThe link expires in 7 days.`,
      }),
    });
    if (!response.ok) console.error("Invite email failed", response.status, await response.text());
    return response.ok;
  } catch (error) {
    console.error("Invite email failed", error);
    return false;
  }
}
