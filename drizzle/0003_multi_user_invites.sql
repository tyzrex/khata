ALTER TABLE "people" ADD COLUMN "linked_user_id" text REFERENCES "user"("id") ON DELETE set null;--> statement-breakpoint
CREATE INDEX "people_linked_user_idx" ON "people" USING btree ("linked_user_id");--> statement-breakpoint
CREATE TABLE "group_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"creator_user_id" text NOT NULL,
	"invitee_email" text,
	"person_id" text,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_creator_user_id_user_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_accepted_by_user_id_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_invites_group_idx" ON "group_invites" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_invites_token_idx" ON "group_invites" USING btree ("token");--> statement-breakpoint
CREATE TABLE "group_user_access" (
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_user_access_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "group_user_access" ADD CONSTRAINT "group_user_access_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_user_access" ADD CONSTRAINT "group_user_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_user_access" ADD CONSTRAINT "group_user_access_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_user_access_user_idx" ON "group_user_access" USING btree ("user_id");
--> statement-breakpoint
INSERT INTO "group_user_access" ("group_id", "user_id", "owner_user_id", "role") SELECT "id", "user_id", "user_id", 'owner' FROM "groups" WHERE "user_id" IS NOT NULL ON CONFLICT DO NOTHING;
