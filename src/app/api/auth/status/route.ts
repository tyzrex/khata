import type { NextRequest } from "next/server";
import { beginRequest } from "@/lib/http";
import { bearerMatches, expectedSessionToken, passcodeConfigured, safeEqual, SESSION_COOKIE } from "@/lib/passcode";

export async function GET(request: NextRequest) {
  await beginRequest();
  const required = passcodeConfigured();
  if (!required) return Response.json({ required: false, authenticated: true });
  if (bearerMatches(request)) return Response.json({ required: true, authenticated: true });
  const expected = await expectedSessionToken();
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  return Response.json({ required: true, authenticated: Boolean(expected && token && safeEqual(token, expected)) });
}
