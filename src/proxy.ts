import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedWrite, trustedOrigins } from "@/lib/request-guard";
import { safeNext } from "@/lib/return-path";

const PUBLIC_PATHS = new Set(["/", "/accounts", "/login", "/offline", "/manifest.webmanifest", "/api/v1", "/api/v1/openapi.json", "/api/v1/llms.txt"]);

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname.startsWith("/invite/")) return true;
  // Allow reading invite info (GET) without auth; accepting still requires auth
  if (pathname.startsWith("/api/invite/") && !pathname.endsWith("/accept")) return true;
  return pathname.startsWith("/icons/") || pathname.startsWith("/splash/");
}

/** Sections used to be `/?view=ledger`; they are real routes now. Old bookmarks and installed shortcuts still land. */
const LEGACY_VIEWS: Record<string, string> = {
  overview: "/",
  ledger: "/ledger",
  categories: "/categories",
  sync: "/sync",
  friends: "/friends",
  groups: "/groups",
  balances: "/balances",
  activity: "/activity",
  settings: "/settings",
};

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const legacy = pathname === "/" ? LEGACY_VIEWS[request.nextUrl.searchParams.get("view") ?? ""] : undefined;
  if (legacy) {
    const moved = request.nextUrl.clone();
    moved.pathname = legacy;
    moved.searchParams.delete("view");
    return NextResponse.redirect(moved);
  }
  // CSRF: a cookie-authenticated write must come from this site. Better Auth runs
  // the same check on its own routes, so /api/auth is left to it.
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth") && !isAllowedWrite(request, trustedOrigins())) {
    return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  }
  if (isPublic(pathname)) return NextResponse.next();

  if (getSessionCookie(request)) return NextResponse.next();

  // Bearer tokens (a session token or a khata_ API key) and X-API-Key are checked by the route itself.
  const authorization = request.headers.get("authorization");
  if (pathname.startsWith("/api/") && (authorization?.toLowerCase().startsWith("bearer ") || request.headers.has("x-api-key"))) {
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
  matcher: ["/((?!_next/static|_next/image|icons/|splash/|favicon.ico|icon.png|sw.js|swe-worker|manifest.webmanifest).*)"],
};
