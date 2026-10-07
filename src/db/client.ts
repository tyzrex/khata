import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

const globalForDb = globalThis as unknown as { khataPool?: Pool };

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!globalForDb.khataPool) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 20_000,
    });
    pool.on("error", (error) => {
      console.error("Postgres pool error", error);
    });
    if (process.env.VERCEL) {
      attachDatabasePool(pool);
    }
    globalForDb.khataPool = pool;
  }
  return globalForDb.khataPool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}
