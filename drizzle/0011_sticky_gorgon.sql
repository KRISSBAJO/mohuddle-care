CREATE TABLE "document_request_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"type_id" uuid,
	"label" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"document_id" uuid,
	"review_note" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid,
	"title" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"due_on" date,
	"created_by" uuid,
	"revoked_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_requests_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "document_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"per_home" boolean DEFAULT false NOT NULL,
	"expires" boolean DEFAULT false NOT NULL,
	"validity_months" integer,
	"reminder_days" integer DEFAULT 30 NOT NULL,
	"needs_approval" boolean DEFAULT true NOT NULL,
	"credential_type" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type_id" uuid,
	"title" text NOT NULL,
	"owner_kind" text NOT NULL,
	"staff_id" uuid,
	"individual_id" uuid,
	"home_id" uuid,
	"status" text DEFAULT 'submitted' NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"issued_on" date,
	"expires_on" date,
	"notes" text DEFAULT '' NOT NULL,
	"review_note" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'upload' NOT NULL,
	"uploaded_by" uuid,
	"uploaded_by_name" text DEFAULT '' NOT NULL,
	"request_item_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"superseded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_request_items" ADD CONSTRAINT "document_request_items_request_id_document_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."document_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_request_items" ADD CONSTRAINT "document_request_items_type_id_document_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."document_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_request_items" ADD CONSTRAINT "document_request_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_type_id_document_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."document_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_individual_id_individuals_id_fk" FOREIGN KEY ("individual_id") REFERENCES "public"."individuals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_superseded_by_documents_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_request_items_request" ON "document_request_items" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "documents_staff" ON "documents" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "documents_person" ON "documents" USING btree ("individual_id");--> statement-breakpoint
CREATE INDEX "documents_type" ON "documents" USING btree ("type_id");--> statement-breakpoint
CREATE INDEX "documents_expiry" ON "documents" USING btree ("expires_on");--> statement-breakpoint
-- Default document types. Admins change, add or retire these under Documents, Document types.
INSERT INTO "document_types" ("name", "category", "description", "required", "roles", "per_home", "expires", "validity_months", "reminder_days", "credential_type", "sort_order") VALUES
  ('Signed job application', 'staff', 'The completed and signed application form.', true, '[]', false, false, NULL, 30, '', 1),
  ('Form I-9, employment eligibility', 'staff', 'Completed I-9 with copies of the documents seen.', true, '[]', false, false, NULL, 30, '', 2),
  ('Form W-4', 'staff', 'Federal tax withholding.', true, '[]', false, false, NULL, 30, '', 3),
  ('Direct deposit authorization', 'staff', 'Bank details for pay, with a voided check or bank letter.', true, '[]', false, false, NULL, 30, '', 4),
  ('Government photo ID or driver''s license', 'staff', 'Front and back.', true, '[]', false, true, NULL, 45, 'Driver Licence', 5),
  ('Social Security card', 'staff', '', true, '[]', false, false, NULL, 30, '', 6),
  ('Criminal background check', 'staff', 'Fingerprint background check result.', true, '[]', false, true, 60, 60, 'Background Check', 7),
  ('Abuse registry and exclusion list checks', 'staff', 'Tennessee abuse registry, sex offender registry and OIG exclusion list results.', true, '[]', false, true, 12, 30, '', 8),
  ('TB test result', 'staff', 'Skin test or chest X-ray result.', true, '[]', false, true, 12, 30, '', 9),
  ('CPR and First Aid certificate', 'staff', '', true, '[]', false, true, 24, 45, 'CPR and First Aid', 10),
  ('DIDD Core Training certificate', 'staff', '', true, '[]', false, false, NULL, 30, 'DIDD Core Training', 11),
  ('Medication Administration certificate', 'staff', 'Required for staff who give medication.', true, '["dsp","residential_manager"]', false, true, 12, 45, 'Medication Administration', 12),
  ('Nursing license', 'staff', 'Current Tennessee RN or LPN license.', true, '["nurse"]', false, true, 24, 60, '', 13),
  ('Signed employee handbook acknowledgment', 'staff', '', true, '[]', false, false, NULL, 30, '', 14),
  ('HIPAA and confidentiality agreement', 'staff', '', true, '[]', false, false, NULL, 30, '', 15),
  ('Signed job description', 'staff', '', true, '[]', false, false, NULL, 30, '', 16),
  ('Emergency contact form', 'staff', '', true, '[]', false, false, NULL, 30, '', 17),
  ('Auto insurance card', 'staff', 'For staff who drive people in their own car.', false, '[]', false, true, 6, 30, '', 18),
  ('Annual performance review', 'staff', '', false, '[]', false, true, 12, 30, '', 19),
  ('Individual Support Plan (ISP)', 'person', 'The current signed ISP.', true, '[]', false, true, 12, 60, '', 1),
  ('Insurance card', 'person', 'Front and back of each card.', true, '[]', false, false, NULL, 30, '', 2),
  ('Annual physical', 'person', 'Report from the yearly physical exam.', true, '[]', false, true, 12, 45, '', 3),
  ('Emergency medical face sheet', 'person', 'One page for hospitals: diagnoses, medications, allergies, contacts.', true, '[]', false, true, 12, 30, '', 4),
  ('Consent for services and photo release', 'person', '', true, '[]', false, true, 12, 30, '', 5),
  ('Behavior support plan', 'person', '', false, '[]', false, true, 12, 45, '', 6),
  ('Physician''s orders', 'person', '', false, '[]', false, true, 12, 30, '', 7),
  ('Nutrition or dietary plan', 'person', 'From the dietitian, including texture and fluid guidance.', false, '[]', false, true, 12, 30, '', 8),
  ('Guardianship or conservatorship papers', 'person', '', false, '[]', false, false, NULL, 30, '', 9),
  ('Medicaid or TennCare eligibility letter', 'person', '', false, '[]', false, true, 12, 45, '', 10),
  ('State ID', 'person', '', false, '[]', false, true, NULL, 45, '', 11),
  ('Business license', 'business', '', true, '[]', false, true, 12, 60, '', 1),
  ('DIDD provider license or agreement', 'business', '', true, '[]', false, true, 12, 90, '', 2),
  ('General liability insurance', 'business', 'Certificate of insurance.', true, '[]', false, true, 12, 60, '', 3),
  ('Workers'' compensation insurance', 'business', '', true, '[]', false, true, 12, 60, '', 4),
  ('Commercial auto insurance', 'business', '', false, '[]', false, true, 12, 60, '', 5),
  ('Policies and procedures manual', 'business', 'The current approved manual.', true, '[]', false, false, NULL, 30, '', 6),
  ('Fire inspection', 'business', 'Fire marshal inspection report for the home.', true, '[]', true, true, 12, 60, '', 7),
  ('Emergency preparedness plan', 'business', 'Evacuation and emergency plan for the home.', true, '[]', true, true, 12, 45, '', 8),
  ('Licensing inspection', 'business', 'Most recent licensing survey for the home.', false, '[]', true, true, 12, 60, '', 9),
  ('Vehicle registration', 'business', 'For each agency vehicle.', false, '[]', false, true, 12, 30, '', 10);
