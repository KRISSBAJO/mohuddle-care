CREATE TABLE "owner_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"login_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "logins" ADD COLUMN "owner_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "logins" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "logins" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "logins" ADD COLUMN "backup_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "owner_sessions" ADD CONSTRAINT "owner_sessions_login_id_logins_id_fk" FOREIGN KEY ("login_id") REFERENCES "public"."logins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Owner sessions are Mohuddle's own: row rules on with no policy, and no rights for the app's role.
ALTER TABLE "owner_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "owner_sessions" FROM mohuddle_app;
