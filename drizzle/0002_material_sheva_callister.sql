ALTER TABLE "individuals" ADD COLUMN "discharged_at" date;--> statement-breakpoint
ALTER TABLE "individuals" ADD COLUMN "discharge_reason" text DEFAULT '' NOT NULL;