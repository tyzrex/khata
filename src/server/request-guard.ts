/**
 * Request hardening that does not depend on Next or the database, so it can be
 * unit tested and shared by the proxy and route handlers.
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function trimOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

/**
 * Origins allowed to make cookie-authenticated requests: local dev, BETTER_AUTH_URL,
 * this Vercel deployment's own hosts, and TRUSTED_ORIGINS. Shared with Better Auth.
 */
export function trustedOrigins(env: Record<string, string | undefined> = process.env) {
  const origins = ["http://localhost:3847", "http://127.0.0.1:3847", "http://100.124.156.27:3847"];
  const base = env.BETTER_AUTH_URL ? trimOrigin(env.BETTER_AUTH_URL) : "";
  if (base) origins.push(base);
  // Vercel sets these to the deployment's own hosts. Using them keeps Preview
  // sign-in working without trusting arbitrary subdomains of the Vercel
  // platform domain, which a broad wildcard would.
  for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    const value = host?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (value) origins.push(`https://${value}`);
  }
  for (const extra of (env.TRUSTED_ORIGINS ?? "").split(",")) {
    const value = trimOrigin(extra);
    if (value) origins.push(value);
  }
  return [...new Set(origins)];
}

/**
 * CSRF check for cookie-authenticated writes. A browser always sends `Origin` on a
 * cross-origin POST/PATCH/DELETE, so a write whose Origin host is neither the host it
 * was sent to nor a trusted origin is refused. The Host header is safe to compare
 * against: a victim's browser sets it to the real target, never to the attacker's site.
 * Requests without Origin (curl, bearer-token clients) pass unless the browser marks
 * them `Sec-Fetch-Site: cross-site`.
 */
export function isAllowedWrite(request: { method: string; headers: Headers }, allowed: string[]) {
  if (!MUTATING.has(request.method.toUpperCase())) return true;
  const origin = request.headers.get("origin");
  if (origin === "null") return false;
  if (origin) {
    if (allowed.includes(origin)) return true;
    const target = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    try {
      return Boolean(target) && new URL(origin).host === target;
    } catch {
      return false;
    }
  }
  return request.headers.get("sec-fetch-site") !== "cross-site";
}

/** Invite tokens are 24 random bytes in base64url (32 chars). Reject anything else before a lookup. */
export function isInviteToken(value: string) {
  return /^[A-Za-z0-9_-]{32}$/.test(value);
}

/** First hop of X-Forwarded-For (set by Vercel and most proxies), else X-Real-IP. */
export function clientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

/** What `limits` entries are. A route declares one; `defineRoute` calls it. */
export type RateLimiter = { take(key: string, now?: number): RateLimitResult };

/**
 * Fixed-window counter kept in memory. Best effort: each server instance counts on
 * its own, which is enough to blunt scripted abuse of email and import endpoints
 * without adding a store. Old windows are pruned as keys are touched.
 */
export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, { start: number; count: number }>();
  return {
    take(key: string, now = Date.now()): RateLimitResult {
      const entry = hits.get(key);
      if (!entry || now - entry.start >= windowMs) {
        if (hits.size >= maxKeys) {
          for (const [stale, value] of hits) {
            if (now - value.start >= windowMs) hits.delete(stale);
          }
          if (hits.size >= maxKeys) hits.delete(hits.keys().next().value!);
        }
        hits.set(key, { start: now, count: 1 });
        return { ok: true };
      }
      if (entry.count >= limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((entry.start + windowMs - now) / 1000)) };
      entry.count += 1;
      return { ok: true };
    },
  };
}

const HOUR = 60 * 60 * 1000;

/** Shared limiters, one per abuse surface. Module scope so they live as long as the server instance. */
export const limits = {
  /** Invite links created per user. */
  invites: createRateLimiter({ limit: 30, windowMs: HOUR }),
  /** Invite emails sent per user. Each one goes to an address the sender typed. */
  inviteEmails: createRateLimiter({ limit: 10, windowMs: HOUR }),
  /** Invite emails to one recipient address, across all senders. */
  inviteRecipient: createRateLimiter({ limit: 3, windowMs: 24 * HOUR }),
  /** Public invite lookups and accepts per client IP. */
  inviteLookups: createRateLimiter({ limit: 60, windowMs: 10 * 60 * 1000 }),
  /** Bulk writes (import, sample seed) per user. */
  bulkWrites: createRateLimiter({ limit: 20, windowMs: HOUR }),
  /** Personal API keys created per user. */
  apiKeys: createRateLimiter({ limit: 10, windowMs: HOUR }),
  /** Test push notifications sent per user. */
  pushTests: createRateLimiter({ limit: 5, windowMs: HOUR }),
  /** Writes through the /api/v1 agent API per user. Generous for a chat bot, tight for a runaway loop. */
  agentWrites: createRateLimiter({ limit: 300, windowMs: HOUR }),
};
