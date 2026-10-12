import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { bearer } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDb } from "@/db/client";
import { purgeUserData, purgeUserVerification } from "@/db/purge-user";
import * as schema from "@/db/schema";
import { sendDeleteAccountVerification, sendResetPasswordEmail, sendVerificationEmail } from "@/server/account-email";
import { trustedOrigins } from "@/server/request-guard";

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
      // An hour is long enough to reach an inbox and short enough that a leaked
      // link is stale by the time anyone else finds it. The token is single-use.
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await sendResetPasswordEmail({ user, url });
      },
    },
    // On by default in production only; the custom rules make credential guessing slower.
    rateLimit: {
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        // Asking for a reset sends mail, so it is capped tighter than the other
        // endpoints: otherwise this is an open relay for someone else's inbox.
        "/request-password-reset": { window: 300, max: 5 },
        "/reset-password": { window: 300, max: 10 },
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
    emailVerification: {
      // Without this, /change-email fails with "Verification email isn't enabled".
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationEmail({ user, url });
      },
    },
    user: {
      changeEmail: {
        enabled: true,
        // Left off: a verified address is re-confirmed at the new one rather than swapped silently.
      },
      deleteUser: {
        enabled: true,
        // better-auth drops the user row and lets the FKs cascade, but RESTRICT against
        // `people` can fire before its referrers go. Clear them first, in order.
        beforeDelete: async (user) => {
          await purgeUserData(user.id);
        },
        // The path a Google-only account can take: it has no password to confirm with.
        sendDeleteAccountVerification: async ({ user, url }) => {
          await sendDeleteAccountVerification({ user, url });
        },
        afterDelete: async (user) => {
          await purgeUserVerification(user.id);
        },
      },
    },
    plugins: [bearer(), nextCookies()],
  });
}

type AuthInstance = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { khataAuth?: AuthInstance; khataAuthKey?: string };

/**
 * Editing the options in `createAuth` must invalidate the cached instance rather
 * than leave it serving the previous edit until `bun dev` restarts. The old fix
 * threw a random id into the key, which does work at runtime but is fatal to
 * prerendering: Next treats a read of randomness during a prerender pass as
 * unstable, and `/groups/[id]` failed instant-validation with
 * "Next.js encountered the unstable value `Math.random()`".
 *
 * `createAuth.toString()` gives the same signal deterministically — it changes
 * exactly when the options below are edited, and reading it is stable across a
 * prerender and the request that follows. Production does not need it: env alone is
 * the only thing that can change without a redeploy.
 */
function authConfigKey() {
  const source = process.env.NODE_ENV === "production" ? "" : createAuth.toString();
  return JSON.stringify([
    source,
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
