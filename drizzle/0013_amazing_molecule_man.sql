CREATE TABLE "person_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"individual_id" uuid NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"organization" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"alt_phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"fax" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_insurance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"individual_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"rank" text DEFAULT 'primary' NOT NULL,
	"payer" text DEFAULT '' NOT NULL,
	"plan" text DEFAULT '' NOT NULL,
	"member_id" text DEFAULT '' NOT NULL,
	"group_number" text DEFAULT '' NOT NULL,
	"policy_holder" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"notes" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person_contacts" ADD CONSTRAINT "person_contacts_individual_id_individuals_id_fk" FOREIGN KEY ("individual_id") REFERENCES "public"."individuals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_insurance" ADD CONSTRAINT "person_insurance_individual_id_individuals_id_fk" FOREIGN KEY ("individual_id") REFERENCES "public"."individuals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_contacts_person" ON "person_contacts" USING btree ("individual_id");--> statement-breakpoint
CREATE INDEX "person_insurance_person" ON "person_insurance" USING btree ("individual_id");