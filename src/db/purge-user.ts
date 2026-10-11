import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

/**
 * Delete a person's rows that the foreign keys will not cascade for us.
 *
 * `shared_expenses.paid_by_id` and `settlements.{from,to}_person_id` are ON DELETE
 * RESTRICT against `people`, and RESTRICT is checked the moment a row goes rather
 * than at end of statement. Deleting the user row cascades to both `people` and
 * those tables, so which one Postgres reaches first decides whether the delete
 * succeeds — not something to leave to chance, and not something better-auth
 * retries. Clearing the referrers first makes the order explicit, the same order
 * `0004_isolate_user_id.sql` used.
 *
 * Everything else — groups, people, categories, transactions, accounts, api_keys,
 * group_invites, group_user_access — is plain ON DELETE CASCADE from `user.id` and
 * needs no help. `shared_splits` and `expense_transactions` cascade from
 * `shared_expenses`, and `group_members` cascades from groups and people.
 */
const PURGE_ORDER = ["settlements", "shared_expenses"] as const;

export async function purgeUserData(userId: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const table of PURGE_ORDER) {
      await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE "user_id" = ${userId}`);
    }
  });
}

/**
 * Verification rows for a person. The `verification` table carries no foreign key
 * to `user`, so nothing clears these when an account goes: password-reset tokens,
 * email-change tokens and delete-account tokens all linger pointing at an id that
 * no longer exists. Worth sweeping, since delete tokens are created every time
 * someone opens the confirmation dialog.
 */
export async function purgeUserVerification(userId: string) {
  await getDb().execute(sql`DELETE FROM "verification" WHERE "value" = ${userId}`);
}