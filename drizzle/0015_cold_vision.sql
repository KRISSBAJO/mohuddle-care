ALTER TABLE "individuals" ADD COLUMN "preferred_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "individuals" ADD COLUMN "gender" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "individuals" ADD COLUMN "pronouns" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "individuals" ADD COLUMN "primary_language" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "individuals" ADD COLUMN "communication" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "individuals" ADD COLUMN "mobility" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "individuals" ADD COLUMN "diet" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "individuals" ADD COLUMN "likes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_goals" ADD COLUMN "measurable_step" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_goals" ADD COLUMN "frequency_count" integer;--> statement-breakpoint
ALTER TABLE "plan_goals" ADD COLUMN "frequency_period" text;--> statement-breakpoint
ALTER TABLE "plan_goals" ADD COLUMN "effective_date" date;--> statement-breakpoint
ALTER TABLE "plan_goals" ADD COLUMN "documented_on" text DEFAULT 'Daily notes' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_goals" ADD COLUMN "setup_notes" text DEFAULT '' NOT NULL;