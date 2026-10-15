import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { count, eq } from "drizzle-orm";
import { DEFAULT_DOCUMENT_TYPES, DEFAULT_SHIFT_PATTERNS } from "../src/lib/agency-defaults";
import { DEFAULT_TEMPLATES } from "../src/lib/default-sign-templates";
import { zone } from "../src/lib/format";

const skip = process.env.RUN_DB_TESTS !== "1";

test("a new agency starts with the defaults, its own administrator, and nothing of anyone else's", { skip }, async () => {
  assert.notEqual(process.env.NODE_ENV, "production", "Use a development database only.");
  const { asAgency, db, pool, schema, systemDb, systemPool } = await import("../src/server/db");
  const { agencyIdBySlug } = await import("../src/server/agency");
  const { createAgency, slugProblem, setAgencyActive, addAgencyAdmin } = await import("../src/server/owner");
  const tag = randomBytes(4).toString("hex");
  const slug = `owner-test-${tag}`;
  const email = `owner-test-${tag}@example.test`;
  let agencyId: string | undefined;
  try {
    assert.ok(slugProblem("app"), "Mohuddle's own names are kept back");
    assert.ok(slugProblem("Bad Name"));
    assert.equal(slugProblem("sunrise-care"), null);

    const profile = { name: "Example Test Agency", legalName: "Example Test Agency LLC", phone: "", email: "", address: "", cityStateZip: "", timezone: "America/Denver" };
    const created = await createAgency(slug, profile, { name: "Pat Example", email });
    assert.ok(!("error" in created), "The agency is created");
    agencyId = created.agencyId;
    assert.ok(created.admin.link?.includes("/setup-password/"), "The first administrator gets a setup link");
    assert.equal((await createAgency(slug, profile, { name: "Pat Example", email })).error, "Another agency already uses that web address.");

    await asAgency(agencyId, async () => {
      assert.equal(zone(), "America/Denver", "Code running as the agency uses its time zone");
      const [types] = await db.select({ n: count() }).from(schema.documentTypes);
      const [templates] = await db.select({ n: count() }).from(schema.signTemplates);
      const [patterns] = await db.select({ n: count() }).from(schema.shiftPatterns);
      const [people] = await db.select({ n: count() }).from(schema.individuals);
      assert.equal(types.n, DEFAULT_DOCUMENT_TYPES.length);
      assert.equal(templates.n, DEFAULT_TEMPLATES.length);
      assert.equal(patterns.n, DEFAULT_SHIFT_PATTERNS.length);
      assert.equal(people.n, 0, "A new agency sees none of Milestone's people");
      const [admin] = await db.select().from(schema.users).where(eq(schema.users.email, email));
      assert.equal(admin.role, "admin");
      assert.ok(admin.staffId, "The administrator has a staff record");
    });
    assert.equal((await addAgencyAdmin(agencyId, { name: "Pat Example", email })).error, "This email already has a login in this agency.");

    // Turning it off ends its sign-ins; Milestone is untouched.
    await setAgencyActive(agencyId, false);
    const [off] = await systemDb.select({ active: schema.agencies.active }).from(schema.agencies).where(eq(schema.agencies.id, agencyId));
    assert.equal(off.active, false);
    const milestone = await agencyIdBySlug("milestone");
    const [milestoneRow] = await systemDb.select({ active: schema.agencies.active }).from(schema.agencies).where(eq(schema.agencies.id, milestone!));
    assert.equal(milestoneRow.active, true);
  } finally {
    if (agencyId) {
      // Removes everything the test agency owns, in any order, then the agency and the test login.
      const client = await systemPool.connect();
      try {
        await client.query("begin");
        await client.query("set local session_replication_role = replica");
        const { rows } = await client.query<{ table_name: string }>("select table_name from information_schema.columns where table_schema = 'public' and column_name = 'agency_id'");
        for (const row of rows) await client.query(`delete from "${row.table_name}" where agency_id = $1`, [agencyId]);
        await client.query("delete from agencies where id = $1", [agencyId]);
        await client.query("delete from logins where email = $1", [email]);
        await client.query("commit");
      } finally {
        client.release();
      }
    }
    await pool.end();
    await systemPool.end();
  }
});
