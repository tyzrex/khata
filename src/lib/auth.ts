import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { bearer } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { trustedOrigins } from "@/lib/request-guard";

function authDatabase() {
  if (process.env.DATABASE_URL) return getDb();
  return drizzle(new Pool({ connectionString: "postgresql://placeholder:placeholder@127.0.0.1:5432/khata" }), { schema });
}

export function googleAuthEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

const PLACEHOLDER_SECRET = "replace-with-openssl-rand-base64-32";

/**
 * Refuse to sign sessions with a missing, placeholder or short secret in production.
 * Checked when the auth instance is first built (a request), not at import, so
 * `next build` without runtime secrets still succeeds.
 */
export function assertAuthSecret(env: Record<string, string | undefined> = process.env) {
  if (env.NODE_ENV !== "production" || env.NEXT_PHASE === "phase-production-build") return;
  const secret = env.BETTER_AUTH_SECRET?.trim() ?? "";
  if (!secret || secret === PLACEHOLDER_SECRET || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be set to at least 32 random characters in production. Generate one with: openssl rand -base64 32");
  }
}

function createAuth() {
  assertAuthSecret();
  return betterAuth({
    appName: "Khata",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(),
    database: drizzleAdapter(authDatabase(), {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    // On by default in production only; the custom rules make credential guessing slower.
    rateLimit: {
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },
    ...(googleAuthEnabled()
      ? {
          socialProviders: {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID as string,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
              prompt: "select_account" as const,
            },
          },
        }
      : {}),
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
      },
    },
    plugins: [bearer(), nextCookies()],
  });
}

type AuthInstance = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { khataAuth?: AuthInstance; khataAuthKey?: string };

// The instance is cached across hot reloads, but it bakes in env at creation
// time. Key the cache on that env so editing .env.local (e.g. adding the Google
// credentials) rebuilds it instead of serving a stale instance with no
// `google` provider, which surfaces as "Provider not found".
function authConfigKey() {
  return JSON.stringify([
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.BETTER_AUTH_URL,
    process.env.BETTER_AUTH_SECRET,
    process.env.DATABASE_URL,
    process.env.TRUSTED_ORIGINS,
  ]);
}

export function getAuth() {
  const key = authConfigKey();
  if (!globalForAuth.khataAuth || globalForAuth.khataAuthKey !== key) {
    globalForAuth.khataAuth = createAuth();
    globalForAuth.khataAuthKey = key;
  }
  return globalForAuth.khataAuth;
}

export type AuthSession = AuthInstance["$Infer"]["Session"];
