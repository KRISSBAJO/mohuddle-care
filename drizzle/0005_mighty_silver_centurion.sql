ALTER TABLE "homes" ADD COLUMN "zip" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "homes" ADD COLUMN "county" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "homes" ADD COLUMN "license_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "homes" ADD COLUMN "opened_on" date;--> statement-breakpoint
ALTER TABLE "homes" ADD COLUMN "notes" text DEFAULT '' NOT NULL;