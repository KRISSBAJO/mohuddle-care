ALTER TABLE "incidents" ADD COLUMN "responsible_provider" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "reporting_provider" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "person_alias" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "waiver_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "mco" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "mco_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "event_location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "event_address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "event_city" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "event_state" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "event_zip" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "event_region" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "occurred_unknown" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "discovered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "witness_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "witnessed_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "event_types" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "other_event_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "injured_parties" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "interventions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "prn_given_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "injury" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "injury_details" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "involvement" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "notifications" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "tier" text DEFAULT '' NOT NULL;