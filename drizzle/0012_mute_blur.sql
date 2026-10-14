CREATE TABLE "sign_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'staff' NOT NULL,
	"type_id" uuid,
	"body" text DEFAULT '' NOT NULL,
	"source_key" text,
	"source_name" text DEFAULT '' NOT NULL,
	"source_pages" integer,
	"initial_each" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid,
	"template_version" integer DEFAULT 1 NOT NULL,
	"request_item_id" uuid,
	"document_id" uuid,
	"staff_id" uuid,
	"individual_id" uuid,
	"signer_name" text NOT NULL,
	"signer_relation" text DEFAULT '' NOT NULL,
	"method" text NOT NULL,
	"typed_name" text DEFAULT '' NOT NULL,
	"typed_initials" text DEFAULT '' NOT NULL,
	"initials_count" integer DEFAULT 0 NOT NULL,
	"content_hash" text NOT NULL,
	"signed_hash" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"signed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_request_items" ADD COLUMN "kind" text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_request_items" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "document_requests" ADD COLUMN "individual_id" uuid;--> statement-breakpoint
ALTER TABLE "document_requests" ADD COLUMN "recipient_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_requests" ADD COLUMN "recipient_relation" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sign_templates" ADD CONSTRAINT "sign_templates_type_id_document_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."document_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_templates" ADD CONSTRAINT "sign_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_template_id_sign_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."sign_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_request_item_id_document_request_items_id_fk" FOREIGN KEY ("request_item_id") REFERENCES "public"."document_request_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_individual_id_individuals_id_fk" FOREIGN KEY ("individual_id") REFERENCES "public"."individuals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_request_items" ADD CONSTRAINT "document_request_items_template_id_sign_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."sign_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_individual_id_individuals_id_fk" FOREIGN KEY ("individual_id") REFERENCES "public"."individuals"("id") ON DELETE cascade ON UPDATE no action;