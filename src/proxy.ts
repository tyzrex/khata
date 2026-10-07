import { NextResponse, type NextRequest } from "next/server";
import { bearerMatches, expectedSessionToken, passcodeConfigured, safeEqual, SESSION_COOKIE } from "@/lib/passcode";

const PUBLIC_PATHS = new Set(["/login", "/offline", "/api/auth/login", "/api/auth/logout", "/api/auth/status", "/manifest.webmanifest"]);

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return pathname.startsWith("/icons/");
}

export async function proxy(request: NextRequest) {
  if (!passcodeConfigured()) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();
  if (bearerMatches(request)) return NextResponse.next();

  const expected = await expectedSessionToken();
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  if (expected && token && safeEqual(token, expected)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Passcode required." }, { status: 401 });
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  const next = `${pathname}${request.nextUrl.search}`;
  if (next !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons/|favicon.ico|icon.png|sw.js|swe-worker|manifest.webmanifest).*)"],
};
