import { z } from "zod";

/* Every setting the server needs, read once and checked. A bad value stops start-up with a clear message. */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3400"),
  DATABASE_URL: z.string().startsWith("postgres"),
  SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map(issue => `  ${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Environment is not configured:\n${lines.join("\n")}\nSee .env.example.`);
}

export const env = parsed.data;
