CREATE TABLE "session_handoffs" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"agency_id_for" uuid NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Platform-only: row rules on with no policy, and no rights for the app's role.
ALTER TABLE "session_handoffs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "session_handoffs" FROM mohuddle_app;
