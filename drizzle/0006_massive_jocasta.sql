CREATE TABLE "incident_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" text DEFAULT 'note' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "state_filed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "state_reference" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "state_filed_by" uuid;--> statement-breakpoint
ALTER TABLE "incident_notes" ADD CONSTRAINT "incident_notes_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_notes" ADD CONSTRAINT "incident_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incident_notes_incident" ON "incident_notes" USING btree ("incident_id","created_at");--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_state_filed_by_users_id_fk" FOREIGN KEY ("state_filed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;