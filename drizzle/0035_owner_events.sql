CREATE TABLE "owner_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login_id" uuid,
	"owner_name" text NOT NULL,
	"action" text NOT NULL,
	"agency_id_for" uuid,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owner_events" ADD CONSTRAINT "owner_events_login_id_logins_id_fk" FOREIGN KEY ("login_id") REFERENCES "public"."logins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_events" ADD CONSTRAINT "owner_events_agency_id_for_agencies_id_fk" FOREIGN KEY ("agency_id_for") REFERENCES "public"."agencies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "owner_events_at" ON "owner_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "owner_events_agency" ON "owner_events" USING btree ("agency_id_for","created_at");--> statement-breakpoint
-- Platform-only: row rules on with no policy, and no rights for the app's role.
ALTER TABLE "owner_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "owner_events" FROM mohuddle_app;
