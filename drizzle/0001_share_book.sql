CREATE TABLE "expense_transactions" (
	"expense_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	CONSTRAINT "expense_transactions_expense_id_transaction_id_pk" PRIMARY KEY("expense_id","transaction_id"),
	CONSTRAINT "expense_transactions_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" text NOT NULL,
	"person_id" text NOT NULL,
	CONSTRAINT "group_members_group_id_person_id_pk" PRIMARY KEY("group_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_self" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text,
	"from_person_id" text NOT NULL,
	"to_person_id" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'NPR' NOT NULL,
	"date" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"transaction_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "shared_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text,
	"description" text NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'NPR' NOT NULL,
	"paid_by_id" text NOT NULL,
	"split_mode" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_splits" (
	"expense_id" text NOT NULL,
	"person_id" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"weight" numeric(14, 4),
	CONSTRAINT "shared_splits_expense_id_person_id_pk" PRIMARY KEY("expense_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "expense_transactions" ADD CONSTRAINT "expense_transactions_expense_id_shared_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."shared_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_transactions" ADD CONSTRAINT "expense_transactions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_from_person_id_people_id_fk" FOREIGN KEY ("from_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_to_person_id_people_id_fk" FOREIGN KEY ("to_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expenses" ADD CONSTRAINT "shared_expenses_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expenses" ADD CONSTRAINT "shared_expenses_paid_by_id_people_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_splits" ADD CONSTRAINT "shared_splits_expense_id_shared_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."shared_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_splits" ADD CONSTRAINT "shared_splits_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "settlements_date_idx" ON "settlements" USING btree ("date");--> statement-breakpoint
CREATE INDEX "shared_expenses_date_idx" ON "shared_expenses" USING btree ("date");--> statement-breakpoint
CREATE INDEX "shared_expenses_group_idx" ON "shared_expenses" USING btree ("group_id");