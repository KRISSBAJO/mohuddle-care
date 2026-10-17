/* First deployment only. Refuses a database with any logins; never chooses a password. */
import { config } from "dotenv";
import { createHash, randomBytes } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/server/db/schema";
import { DEFAULT_DOCUMENT_TYPES, DEFAULT_NOTE_SECTIONS, DEFAULT_SHIFT_PATTERNS } from "../src/lib/agency-defaults";
import { DEFAULT_TEMPLATES } from "../src/lib/default-sign-templates";
import { NOTE_LIBRARY } from "../src/lib/note-library";

function argument(name: string) {
  const at = process.argv.indexOf(name);
  return at < 0 ? "" : (process.argv[at + 1] ?? "");
}

async function main() {
  const envFile = argument("--env");
  if (envFile) config({ path: envFile, override: true, quiet: true });
  const email = argument("--email").trim().toLowerCase();
  const name = argument("--name").trim();
  const file = argument("--link-file");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || !file) {
    throw new Error("Supply --email, --name and a private --link-file outside tracked files.");
  }
  if (!process.env.DATABASE_URL || !process.env.APP_URL || (process.env.SESSION_SECRET?.length ?? 0) < 32) {
    throw new Error("DATABASE_URL, APP_URL and SESSION_SECRET are required.");
  }
  const origin = new URL(process.env.APP_URL);
  if (origin.protocol !== "https:" && origin.hostname !== "localhost") throw new Error("APP_URL must use HTTPS.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10_000 });
  const db = drizzle(pool, { schema });
  // Exclusive creation prevents overwriting an existing setup link. The token never goes to stdout.
  const linkFile = await open(resolve(file), "wx", 0o600);
  let committed = false;
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(688420260)`);
      const existing = await tx.select({ id: schema.logins.id }).from(schema.logins).limit(1);
      if (existing.length) throw new Error("This database already has logins. Use the existing owner or make-owner.ts.");
      const [agency] = await tx.select().from(schema.agencies).where(eq(schema.agencies.slug, "milestone"));
      if (!agency) throw new Error("Run migrations first; the initial Milestone agency is missing.");
      const [login] = await tx.insert(schema.logins).values({ email, isOwner: true, ownerName: name }).returning();
      await tx.insert(schema.ownerEvents).values({ loginId: login.id, ownerName: name, action: "owner:bootstrap", agencyId: agency.id });
      await tx.execute(sql`select set_config('app.agency_id', ${agency.id}, true)`);
      await tx.execute(sql`set local role mohuddle_app`);
      const [first, ...rest] = name.split(/\s+/);
      const [staff] = await tx.insert(schema.staff).values({ firstName: first, lastName: rest.join(" ") || "-", email, role: "admin" }).returning();
      const [user] = await tx.insert(schema.users).values({ email, name, role: "admin", staffId: staff.id, loginId: login.id }).returning();
      const typesBefore = await tx.select({ id: schema.documentTypes.id }).from(schema.documentTypes).limit(1);
      if (!typesBefore.length) {
        const types = await tx.insert(schema.documentTypes).values(DEFAULT_DOCUMENT_TYPES).returning();
        await tx.insert(schema.signTemplates).values(DEFAULT_TEMPLATES.map(t => ({ title: t.title, category: t.category, body: t.body, initialEach: true, typeId: types.find(type => type.name === t.typeName)?.id ?? null })));
        await tx.insert(schema.shiftPatterns).values(DEFAULT_SHIFT_PATTERNS);
        await tx.insert(schema.noteRequirements).values([
          ...DEFAULT_NOTE_SECTIONS.map(section => ({ scope: "all" as const, kind: "section" as const, section, enabled: true })),
          ...NOTE_LIBRARY.map(item => ({ scope: "all" as const, kind: "item" as const, enabled: false, required: true, fieldType: "yes_no", ...item })),
        ]);
      }
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 24 * 3_600_000);
      const tokenHash = createHash("sha256").update(`login:${token}${process.env.SESSION_SECRET}`).digest("hex");
      await tx.insert(schema.loginTokens).values({ tokenHash, userId: user.id, purpose: "invite", expiresAt });
      await tx.insert(schema.auditLog).values({ action: "owner:bootstrap", entity: "user", entityId: user.id });
      if (process.env.AGENCY_ADDRESSES === "on") origin.hostname = `${agency.slug}.${origin.hostname}`;
      origin.pathname = `/setup-password/${token}`;
      await linkFile.writeFile(`${origin.toString()}\nExpires: ${expiresAt.toISOString()}\n`);
    });
    committed = true;
    console.log("First owner created. Open the private link file to choose a password; then enroll an authenticator in the owner console.");
  } finally {
    await linkFile.close();
    if (!committed) await unlink(resolve(file));
    await pool.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Owner setup failed.");
  process.exitCode = 1;
});
