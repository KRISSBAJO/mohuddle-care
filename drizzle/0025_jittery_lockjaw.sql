CREATE TABLE "note_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_kind" text NOT NULL,
	"note_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_notes" ADD COLUMN "review_status" text DEFAULT 'submitted' NOT NULL;--> statement-breakpoint
ALTER TABLE "community_notes" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "community_notes" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "community_notes" ADD COLUMN "return_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "community_notes" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "review_status" text DEFAULT 'submitted' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "return_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "note_events" ADD CONSTRAINT "note_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_events_note" ON "note_events" USING btree ("note_kind","note_id");--> statement-breakpoint
ALTER TABLE "community_notes" ADD CONSTRAINT "community_notes_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_notes_review" ON "community_notes" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "daily_logs_review" ON "daily_logs" USING btree ("review_status","log_date");
