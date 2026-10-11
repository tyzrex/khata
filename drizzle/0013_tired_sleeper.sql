ALTER TABLE "transactions" ADD COLUMN "foreign_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "fx_rate" numeric(18, 6);