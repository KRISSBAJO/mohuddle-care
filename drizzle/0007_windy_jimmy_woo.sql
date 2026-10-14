CREATE TABLE "daily_log_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"log_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"offered" text NOT NULL,
	"prompt_level" text DEFAULT '' NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"attempts" integer,
	"successes" integer,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "shift" "shift_kind";--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "time_in" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "time_out" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "presentation" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "adl" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "meal_intake" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "fluids_oz" integer;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "sleep_hours" real;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "sleep_quality" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "bowel_movements" integer;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "incontinence" integer;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "vitals" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "seizure" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "seizure_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "behaviour_occurred" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "antecedent" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "intervention" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "behaviour_outcome" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "activity_types" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "family_contact" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "appointments" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "signed_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "signed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "daily_log_goals" ADD CONSTRAINT "daily_log_goals_log_id_daily_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."daily_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_log_goals" ADD CONSTRAINT "daily_log_goals_goal_id_plan_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."plan_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_log_goal_once" ON "daily_log_goals" USING btree ("log_id","goal_id");--> statement-breakpoint
CREATE INDEX "daily_log_goals_goal" ON "daily_log_goals" USING btree ("goal_id");