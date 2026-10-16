ALTER TABLE "med_administrations" ADD COLUMN "prn" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "med_administrations" ADD COLUMN "effect" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "med_administrations" ADD COLUMN "effect_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "medications" ADD COLUMN "as_needed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "medications" ADD COLUMN "prn_use" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "medications" ADD COLUMN "prn_min_hours" integer;--> statement-breakpoint
ALTER TABLE "medications" ADD COLUMN "prn_max_per_day" integer;