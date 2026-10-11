CREATE TABLE "shared_expense_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"expense_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"group_id" text,
	"actor_user_id" text,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_expense_revisions_action_check" CHECK ("shared_expense_revisions"."action" in ('updated', 'deleted'))
);
--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "updated_by_user_id" text;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "shared_expenses" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "shared_expenses" ADD COLUMN "updated_by_user_id" text;--> statement-breakpoint
ALTER TABLE "shared_expenses" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "settlements" SET "created_by_user_id" = "user_id", "updated_by_user_id" = "user_id";--> statement-breakpoint
UPDATE "shared_expenses" SET "created_by_user_id" = "user_id", "updated_by_user_id" = "user_id";--> statement-breakpoint
ALTER TABLE "shared_expense_revisions" ADD CONSTRAINT "shared_expense_revisions_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expense_revisions" ADD CONSTRAINT "shared_expense_revisions_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shared_expense_revisions_expense_created_idx" ON "shared_expense_revisions" USING btree ("expense_id","created_at");--> statement-breakpoint
CREATE INDEX "shared_expense_revisions_owner_idx" ON "shared_expense_revisions" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "shared_expense_revisions_group_idx" ON "shared_expense_revisions" USING btree ("group_id");--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expenses" ADD CONSTRAINT "shared_expenses_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expenses" ADD CONSTRAINT "shared_expenses_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;