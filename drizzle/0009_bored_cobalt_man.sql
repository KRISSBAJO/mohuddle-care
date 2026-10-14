CREATE TABLE "note_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"home_id" uuid,
	"individual_id" uuid,
	"kind" text NOT NULL,
	"section" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"field_type" text DEFAULT '' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"help" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "adl_notes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "sleep_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "stool_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "continence_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "extra" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "sections" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "note_requirements" ADD CONSTRAINT "note_requirements_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_requirements" ADD CONSTRAINT "note_requirements_individual_id_individuals_id_fk" FOREIGN KEY ("individual_id") REFERENCES "public"."individuals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_requirements_home" ON "note_requirements" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "note_requirements_person" ON "note_requirements" USING btree ("individual_id");--> statement-breakpoint
-- The agency default note: these optional sections are on for everyone. Bowel and bladder, vital signs and seizure watch are added per home or person.
INSERT INTO "note_requirements" ("scope", "kind", "section", "enabled", "required") VALUES
  ('all', 'section', 'care', true, false),
  ('all', 'section', 'meals', true, false),
  ('all', 'section', 'sleep', true, false),
  ('all', 'section', 'activities', true, false),
  ('all', 'section', 'behaviour', true, false),
  ('all', 'section', 'contacts', true, false);
