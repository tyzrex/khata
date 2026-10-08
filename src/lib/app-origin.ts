import { trustedOrigins } from "@/lib/request-guard";

/**
 * The origin to put in links we hand out (invite URLs, emails). BETTER_AUTH_URL wins.
 * Otherwise the request's host is used only when it is a trusted origin, so a forged
 * Host or X-Forwarded-Host header cannot make Khata email a link to someone else's site.
 */
export function appOrigin(request: Request, env: Record<string, string | undefined> = process.env) {
  const configured = env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const allowed = trustedOrigins(env);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? (host && (host.startsWith("localhost") || host.startsWith("127.")) ? "http" : "https");
  const fromRequest = host ? `${proto}://${host}` : new URL(request.url).origin;
  if (allowed.includes(fromRequest)) return fromRequest;
  const production = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return production ? `https://${production}` : allowed[0]!;
}
