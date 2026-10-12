CREATE TABLE "idempotency_keys" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_idx" ON "idempotency_keys" USING btree ("created_at");