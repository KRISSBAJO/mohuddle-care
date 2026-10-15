import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { count, eq } from "drizzle-orm";

const skip = process.env.RUN_DB_TESTS !== "1";

// Drizzle wraps the database's error; the reason is on its cause.
const refusedByRowRules = (error: unknown) => /row-level security/.test(String((error as { cause?: Error }).cause?.message ?? (error as Error).message));

test("every table but agencies and logins belongs to an agency, behind row rules", { skip }, async () => {
  const { systemPool } = await import("../src/server/db");
  const { rows } = await systemPool.query<{ table_name: string; has_agency: boolean; rls: boolean; policies: number }>(`
    select t.table_name,
      exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'agency_id') as has_agency,
      (select relrowsecurity from pg_class where oid = ('public.' || quote_ident(t.table_name))::regclass) as rls,
      (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = t.table_name) as policies
    from information_schema.tables t
    where t.table_schema = 'public' and t.table_type = 'BASE TABLE'`);
  assert.ok(rows.length > 40);
  // Mohuddle's own tables: no agency, and the app's role sees nothing of them.
  const platformOnly = ["product_enquiries"];
  for (const row of rows) {
    if (!["agencies", "logins", ...platformOnly].includes(row.table_name)) assert.ok(row.has_agency, `${row.table_name} has no agency_id`);
    assert.ok(row.rls, `${row.table_name} has no row rules`);
    if (platformOnly.includes(row.table_name)) assert.equal(row.policies, 0, `${row.table_name} must not be open to agencies`);
    else assert.ok(row.policies > 0, `${row.table_name} has no policy`);
  }
  const { rows: grants } = await systemPool.query("select count(*)::int as n from information_schema.role_table_grants where grantee = 'mohuddle_app' and table_name = any($1)", [platformOnly]);
  assert.equal(grants[0].n, 0, "The app's role has no rights on Mohuddle's own tables");
});

test("one agency never sees, changes or writes into another's rows", { skip }, async () => {
  assert.notEqual(process.env.NODE_ENV, "production", "Use a development database only.");
  const { asAgency, db, pool, schema, systemDb, systemPool } = await import("../src/server/db");
  const { agencyIdBySlug, currentAgency } = await import("../src/server/agency");
  const { getSettings, saveSetting } = await import("../src/server/settings");
  const milestone = await agencyIdBySlug("milestone");
  assert.ok(milestone, "The demo agency must exist.");
  const slug = `isolation-${randomBytes(4).toString("hex")}`;
  const [other] = await systemDb.insert(schema.agencies).values({ slug, name: "Example Test Agency", legalName: "Example Test Agency LLC", email: "office@example.test" }).returning();
  const fixture = `Isolation fixture ${slug}`;
  try {
    const home = await asAgency(other.id, async () => {
      const [row] = await db.insert(schema.homes).values({ name: fixture, type: "group_home" }).returning();
      assert.equal(row.agencyId, other.id, "New rows take the agency they were written in");
      return row;
    });

    // The other agency's home is invisible to Milestone, and cannot be changed or removed from there.
    await asAgency(milestone, async () => {
      const [seen] = await db.select({ n: count() }).from(schema.homes).where(eq(schema.homes.name, fixture));
      assert.equal(seen.n, 0);
      assert.equal((await db.update(schema.homes).set({ name: "Taken over" }).where(eq(schema.homes.id, home.id)).returning()).length, 0);
      assert.equal((await db.delete(schema.homes).where(eq(schema.homes.id, home.id)).returning()).length, 0);
      await assert.rejects(db.insert(schema.homes).values({ agencyId: other.id, name: "Planted", type: "group_home" }), refusedByRowRules);
      assert.equal((await currentAgency())?.id, milestone);
    });

    // Settings are each agency's own.
    const milestoneLate = await asAgency(milestone, async () => (await getSettings()).med_late_minutes);
    const otherLate = milestoneLate === 37 ? 38 : 37;
    await asAgency(other.id, () => saveSetting("med_late_minutes", otherLate));
    assert.equal(await asAgency(other.id, async () => (await getSettings()).med_late_minutes), otherLate);
    assert.equal(await asAgency(milestone, async () => (await getSettings()).med_late_minutes), milestoneLate);

    // With no agency, nothing is visible and nothing can be written.
    await asAgency(null, async () => {
      const [seen] = await db.select({ n: count() }).from(schema.homes);
      assert.equal(seen.n, 0);
      await assert.rejects(db.insert(schema.homes).values({ name: "Nobody's", type: "group_home" }));
    });

    // Connections are shared between agencies; each query still sees only its own agency.
    const counts = await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        asAgency(index % 2 ? other.id : milestone, async () => {
          const [seen] = await db.select({ n: count() }).from(schema.homes).where(eq(schema.homes.name, fixture));
          return { mine: index % 2 === 1, n: seen.n };
        }),
      ),
    );
    for (const result of counts) assert.equal(result.n, result.mine ? 1 : 0);
  } finally {
    await systemDb.delete(schema.settings).where(eq(schema.settings.agencyId, other.id));
    await systemDb.delete(schema.homes).where(eq(schema.homes.agencyId, other.id));
    await systemDb.delete(schema.agencies).where(eq(schema.agencies.id, other.id));
    await pool.end();
    await systemPool.end();
  }
});
