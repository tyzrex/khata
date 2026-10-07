CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"color" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"external_id" text,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'NPR' NOT NULL,
	"category_name" text NOT NULL,
	"merchant" text NOT NULL,
	"account" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "transactions_type_idx" ON "transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_name");