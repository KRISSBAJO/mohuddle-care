CREATE TABLE "product_enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"agency_name" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"handled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "logins" ADD COLUMN "is_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Demo requests are Mohuddle's, not an agency's: row rules on, no policy, and no grant for the app's role.
ALTER TABLE "product_enquiries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "product_enquiries" FROM mohuddle_app;--> statement-breakpoint
-- Demo requests sent before now were filed with an agency's enquiries; they move here.
INSERT INTO "product_enquiries" ("name", "email", "phone", "agency_name", "message", "handled", "created_at")
  SELECT "name", "email", "phone", "interest", "message", "handled", "created_at" FROM "enquiries" WHERE "kind" = 'demo';--> statement-breakpoint
DELETE FROM "enquiries" WHERE "kind" = 'demo';
