import { NextResponse, type NextRequest } from "next/server";
import { beginRequest } from "@/lib/http";
import { SESSION_COOKIE } from "@/lib/passcode";

export async function POST(request: NextRequest) {
  await beginRequest();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.VERCEL === "1" || request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 0,
  });
  return response;
}
