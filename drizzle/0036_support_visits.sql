ALTER TABLE "users" ADD COLUMN "support_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "support_reason" text DEFAULT '' NOT NULL;