import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { bearer } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";

function authDatabase() {
  if (process.env.DATABASE_URL) return getDb();
  return drizzle(new Pool({ connectionString: "postgresql://placeholder:placeholder@127.0.0.1:5432/khata" }), { schema });
}

export function googleAuthEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function createAuth() {
  const trustedOrigins = ["http://localhost:3847", "http://127.0.0.1:3847"];
  if (process.env.VERCEL) trustedOrigins.push("https://*.vercel.app");

  return betterAuth({
    appName: "Khata",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: drizzleAdapter(authDatabase(), {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
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

const globalForAuth = globalThis as unknown as { khataAuth?: AuthInstance };

export function getAuth() {
  globalForAuth.khataAuth ??= createAuth();
  return globalForAuth.khataAuth;
}

export type AuthSession = AuthInstance["$Infer"]["Session"];
