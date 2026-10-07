import { NextResponse, type NextRequest } from "next/server";
import { beginRequest } from "@/lib/http";
import { passcodeConfigured, safeEqual, SESSION_COOKIE, sessionToken } from "@/lib/passcode";

export async function POST(request: NextRequest) {
  await beginRequest();
  if (!passcodeConfigured()) {
    return Response.json({ error: "APP_PASSCODE is not set. This ledger is already open." }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as { passcode?: unknown } | null;
  const passcode = typeof body?.passcode === "string" ? body.passcode : "";
  if (!safeEqual(passcode, process.env.APP_PASSCODE ?? "")) {
    return Response.json({ error: "That passcode does not match." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await sessionToken(passcode), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.VERCEL === "1" || request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
