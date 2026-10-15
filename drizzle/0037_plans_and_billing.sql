CREATE TABLE "agency_billing" (
	"agency_id_for" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid,
	"status" text DEFAULT 'trial' NOT NULL,
	"trial_ends_on" date,
	"paid_until" date,
	"notes" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id_for" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_on" date NOT NULL,
	"covers_until" date NOT NULL,
	"method" text DEFAULT 'invoice' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"recorded_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"base_cents" integer DEFAULT 0 NOT NULL,
	"unit_cents" integer DEFAULT 0 NOT NULL,
	"unit" text DEFAULT 'person' NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_billing" ADD CONSTRAINT "agency_billing_agency_id_for_agencies_id_fk" FOREIGN KEY ("agency_id_for") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_billing" ADD CONSTRAINT "agency_billing_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_agency_id_for_agencies_id_fk" FOREIGN KEY ("agency_id_for") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_payments_agency" ON "billing_payments" USING btree ("agency_id_for","paid_on");--> statement-breakpoint
-- Mohuddle's own: row rules on with no policy, and no rights for the app's role.
ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agency_billing" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "plans", "agency_billing", "billing_payments", "platform_settings" FROM mohuddle_app;--> statement-breakpoint
-- Two starting plans. The owner changes prices and features in the console.
INSERT INTO "plans" ("name", "description", "base_cents", "unit_cents", "unit", "features", "sort_order") VALUES
  ('Essentials', 'Daily notes, medications, schedules, time clock, incidents and documents, with e-signing.', 4900, 600, 'person', '["signing"]', 1),
  ('Complete', 'Everything in Essentials, plus Speak your note and Ask Mohuddle.', 9900, 900, 'person', '["signing","scribe","assistant"]', 2);--> statement-breakpoint
-- Every agency so far gets a billing record: Milestone on Complete, at no charge.
INSERT INTO "agency_billing" ("agency_id_for", "plan_id", "status")
  SELECT a."id", (SELECT "id" FROM "plans" WHERE "name" = 'Complete'), CASE WHEN a."slug" = 'milestone' THEN 'complimentary' ELSE 'active' END FROM "agencies" a;
