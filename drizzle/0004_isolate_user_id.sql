-- Security: remove orphan rows that have NULL user_id so they cannot be adopted
-- by any authenticated user, then enforce NOT NULL on every owner column.

-- 1. Orphan settlements first (they hold RESTRICT FK refs to people/transactions).
DELETE FROM "settlements" WHERE "user_id" IS NULL;
--> statement-breakpoint

-- 2. Orphan shared expenses next (splits/links cascade; paidById RESTRICT ref to people).
DELETE FROM "shared_expenses" WHERE "user_id" IS NULL;
--> statement-breakpoint

-- 3. Orphan people (settlements and shared_expenses restricted refs are now gone).
DELETE FROM "people" WHERE "user_id" IS NULL;
--> statement-breakpoint

-- 4. Orphan groups (group_members cascade).
DELETE FROM "groups" WHERE "user_id" IS NULL;
--> statement-breakpoint

-- 5. Orphan categories.
DELETE FROM "categories" WHERE "user_id" IS NULL;
--> statement-breakpoint

-- 6. Orphan transactions (settlements.transaction_id is SET NULL, so safe).
DELETE FROM "transactions" WHERE "user_id" IS NULL;
--> statement-breakpoint

-- Enforce NOT NULL so the DB rejects any future null-owner insert at the wire level.
ALTER TABLE "categories" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "people" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "shared_expenses" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "settlements" ALTER COLUMN "user_id" SET NOT NULL;
