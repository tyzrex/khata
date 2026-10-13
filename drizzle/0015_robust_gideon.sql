CREATE TABLE "agent_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"api_key_id" text,
	"agent_name" text NOT NULL,
	"tool" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"target_id" text,
	"replayed" boolean DEFAULT false NOT NULL,
	"error_status" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "scopes" jsonb DEFAULT '["read","write","delete"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shared_expenses" ADD COLUMN "items" jsonb;--> statement-breakpoint
ALTER TABLE "agent_operations" ADD CONSTRAINT "agent_operations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_operations" ADD CONSTRAINT "agent_operations_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_operations_user_created_idx" ON "agent_operations" USING btree ("user_id","created_at");