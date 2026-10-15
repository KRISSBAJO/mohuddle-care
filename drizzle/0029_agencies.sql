-- Multi-agency, step 1. Milestone becomes the first agency and every existing row is tagged to it.
CREATE TABLE "agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"city_state_zip" text DEFAULT '' NOT NULL,
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agencies_slug_unique" UNIQUE("slug")
);--> statement-breakpoint
INSERT INTO "agencies" ("id", "slug", "name", "legal_name", "phone", "email", "address", "city_state_zip") VALUES ('4f832e0b-a87b-48ef-a5e6-358f79d178f4', 'milestone', 'Milestone', 'Milestone Home Healthcare Service', '615-964-7088', 'contact@milestonecare.net', '2131 Murfreesboro Pike, Suite 202A', 'Nashville, TN 37217');--> statement-breakpoint
-- The new agency_id columns default to this setting, so existing rows are filled with Milestone.
SELECT set_config('app.agency_id', '4f832e0b-a87b-48ef-a5e6-358f79d178f4', false);--> statement-breakpoint
CREATE TABLE "logins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"has_password" boolean GENERATED ALWAYS AS (password_hash is not null) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "logins_email_unique" UNIQUE("email")
);--> statement-breakpoint
ALTER TABLE "push_subscriptions" DROP CONSTRAINT "push_subscriptions_endpoint_unique";--> statement-breakpoint
ALTER TABLE "staff" DROP CONSTRAINT "staff_email_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
DROP INDEX "pay_period_start";--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "community_notes" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_log_goals" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "document_request_items" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "document_requests" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "document_types" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "handover_reads" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "handovers" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "home_expenses" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "home_issues" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "homes" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "incident_notes" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "individuals" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_ledger" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "login_tokens" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "med_administrations" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "medications" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "note_events" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "note_requirements" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "pay_differentials" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "pay_periods" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "pay_rates" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "person_contacts" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "person_insurance" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_goals" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "shift_patterns" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "sign_templates" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "signatures" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "task_comments" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "time_adjustments" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "time_breaks" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "time_corrections" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entry_changes" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "timesheets" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "weight_records" ADD COLUMN "agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey";--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_pkey" PRIMARY KEY("agency_id","key");--> statement-breakpoint
-- Each person gets one login, holding the email and password; users becomes their place in an agency.
ALTER TABLE "users" ADD COLUMN "login_id" uuid;--> statement-breakpoint
INSERT INTO "logins" ("email", "password_hash", "created_at") SELECT lower("email"), "password_hash", "created_at" FROM "users";--> statement-breakpoint
UPDATE "users" SET "login_id" = "logins"."id" FROM "logins" WHERE "logins"."email" = lower("users"."email");--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "login_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_notes" ADD CONSTRAINT "community_notes_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_log_goals" ADD CONSTRAINT "daily_log_goals_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_request_items" ADD CONSTRAINT "document_request_items_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_types" ADD CONSTRAINT "document_types_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_reads" ADD CONSTRAINT "handover_reads_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_expenses" ADD CONSTRAINT "home_expenses_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_issues" ADD CONSTRAINT "home_issues_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homes" ADD CONSTRAINT "homes_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_notes" ADD CONSTRAINT "incident_notes_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individuals" ADD CONSTRAINT "individuals_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "med_administrations" ADD CONSTRAINT "med_administrations_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_events" ADD CONSTRAINT "note_events_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_requirements" ADD CONSTRAINT "note_requirements_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_differentials" ADD CONSTRAINT "pay_differentials_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_rates" ADD CONSTRAINT "pay_rates_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_contacts" ADD CONSTRAINT "person_contacts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_insurance" ADD CONSTRAINT "person_insurance_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_goals" ADD CONSTRAINT "plan_goals_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_patterns" ADD CONSTRAINT "shift_patterns_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_templates" ADD CONSTRAINT "sign_templates_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_adjustments" ADD CONSTRAINT "time_adjustments_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_breaks" ADD CONSTRAINT "time_breaks_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_corrections" ADD CONSTRAINT "time_corrections_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_changes" ADD CONSTRAINT "time_entry_changes_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_login_id_logins_id_fk" FOREIGN KEY ("login_id") REFERENCES "public"."logins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_records" ADD CONSTRAINT "weight_records_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_device" ON "push_subscriptions" USING btree ("user_id","endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_agency_email" ON "staff" USING btree ("agency_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_agency_email" ON "users" USING btree ("agency_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_agency_login" ON "users" USING btree ("agency_id","login_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_period_start" ON "pay_periods" USING btree ("agency_id","start_date");--> statement-breakpoint
-- The app works through this role. It sees only the rows of the agency set on its connection.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mohuddle_app') THEN
    CREATE ROLE mohuddle_app NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
GRANT mohuddle_app TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO mohuddle_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mohuddle_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mohuddle_app;--> statement-breakpoint
-- Agencies are created by the platform, not by the app. An agency may read and update its own row.
REVOKE INSERT, DELETE ON "agencies" FROM mohuddle_app;--> statement-breakpoint
-- Logins are written only by sign-in code. The app may see who has a password, never the hash.
REVOKE ALL ON "logins" FROM mohuddle_app;--> statement-breakpoint
GRANT SELECT ("id", "email", "has_password", "created_at") ON "logins" TO mohuddle_app;--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'agency_id' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY agency_isolation ON %I TO mohuddle_app USING (agency_id = nullif(current_setting(''app.agency_id'', true), '''')::uuid) WITH CHECK (agency_id = nullif(current_setting(''app.agency_id'', true), '''')::uuid)', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (agency_id)', t || '_agency', t);
  END LOOP;
END
$$;--> statement-breakpoint
ALTER TABLE "agencies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY agency_self ON "agencies" TO mohuddle_app USING ("id" = nullif(current_setting('app.agency_id', true), '')::uuid) WITH CHECK ("id" = nullif(current_setting('app.agency_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "logins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY login_of_agency ON "logins" TO mohuddle_app USING (EXISTS (SELECT 1 FROM "users" WHERE "users"."login_id" = "logins"."id"));
