CREATE TABLE "chat_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"auto" boolean DEFAULT false NOT NULL,
	"last_read_at" timestamp with time zone,
	"last_delivered_at" timestamp with time zone,
	"muted_until" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"mark" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"sender_id" uuid,
	"kind" text DEFAULT 'text' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"reply_to_id" uuid,
	"forwarded" boolean DEFAULT false NOT NULL,
	"mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"person_id" uuid,
	"attachment" jsonb,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"pinned_at" timestamp with time zone,
	"pinned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"home_id" uuid,
	"direct_key" text,
	"created_by" uuid,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_marks" ADD CONSTRAINT "chat_message_marks_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_marks" ADD CONSTRAINT "chat_message_marks_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_marks" ADD CONSTRAINT "chat_message_marks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_reply_to_id_chat_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_person_id_individuals_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."individuals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_pinned_by_users_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reactions" ADD CONSTRAINT "chat_reactions_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reactions" ADD CONSTRAINT "chat_reactions_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reactions" ADD CONSTRAINT "chat_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_member_once" ON "chat_members" USING btree ("chat_id","user_id");--> statement-breakpoint
CREATE INDEX "chat_members_user" ON "chat_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_mark_once" ON "chat_message_marks" USING btree ("message_id","user_id","mark");--> statement-breakpoint
CREATE INDEX "chat_marks_user" ON "chat_message_marks" USING btree ("user_id","mark");--> statement-breakpoint
CREATE INDEX "chat_messages_chat_time" ON "chat_messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_sender" ON "chat_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_reaction_once" ON "chat_reactions" USING btree ("message_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chats_direct_once" ON "chats" USING btree ("agency_id","direct_key") WHERE direct_key is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "chats_home_once" ON "chats" USING btree ("agency_id","home_id") WHERE kind = 'home';--> statement-breakpoint
CREATE UNIQUE INDEX "chats_announcements_once" ON "chats" USING btree ("agency_id") WHERE kind = 'announcements';--> statement-breakpoint
CREATE INDEX "chats_recent" ON "chats" USING btree ("agency_id","last_message_at");--> statement-breakpoint
-- The new tables get their row rule, index and agency-matching links.
SELECT mohuddle_tenant_guards();
