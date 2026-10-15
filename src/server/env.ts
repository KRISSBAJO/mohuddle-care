import { z } from "zod";

/* Every setting the server needs, read once and checked. A bad value stops start-up with a clear message. */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3400"),
  // "on": each agency is used at its own address (slug.<APP_URL host>), with app.<host> to sign in.
  AGENCY_ADDRESSES: z.enum(["on", "off"]).default("off"),
  DATABASE_URL: z.string().startsWith("postgres"),
  SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
  // Document storage. With S3_BUCKET set, files go to S3 (or any S3-compatible store via S3_ENDPOINT).
  // Without it, they go to a private folder on this machine, which is fine for development only.
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.url().optional(),
  S3_PREFIX: z.string().default("milestone/"),
  STORAGE_DIR: z.string().default(".storage"),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(20),
  // Email. Nothing is sent unless EMAIL_PROVIDER is relykit with a key; otherwise it is only logged.
  EMAIL_PROVIDER: z.enum(["console", "relykit"]).default("console"),
  RELYKIT_API_KEY: z.string().optional(),
  RELYKIT_URL: z.url().default("https://api.relykit.com"),
  // The address mail comes from, on a domain verified in RelyKit. Each agency's name is put in front.
  EMAIL_FROM: z.string().default("noreply@send.relykit.com"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map(issue => `  ${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Environment is not configured:\n${lines.join("\n")}\nSee .env.example.`);
}

export const env = parsed.data;
