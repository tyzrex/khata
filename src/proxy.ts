import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/return-path";

const PUBLIC_PATHS = new Set(["/login", "/offline", "/manifest.webmanifest"]);

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/auth")) return true;
  return pathname.startsWith("/icons/");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  if (getSessionCookie(request)) return NextResponse.next();

  const authorization = request.headers.get("authorization");
  if (pathname.startsWith("/api/") && authorization?.toLowerCase().startsWith("bearer ")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  const next = safeNext(`${pathname}${request.nextUrl.search}`);
  if (next !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons/|favicon.ico|icon.png|sw.js|swe-worker|manifest.webmanifest).*)"],
};
