CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid DEFAULT nullif(current_setting('app.agency_id', true), '')::uuid NOT NULL,
	"kind" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"status" text NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text,
	"detail" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_messages_when" ON "email_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_messages_to" ON "email_messages" USING btree ("to_address","created_at");--> statement-breakpoint
-- The new table gets its row rule, index and agency-matching links.
SELECT mohuddle_tenant_guards();
