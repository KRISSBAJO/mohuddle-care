import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { and, eq, gte, lt, count } from "drizzle-orm";
import { addDays, dateKey, zonedTime } from "../src/lib/format";

test("Today prepares medications without opening MAR, is idempotent, and counts more than eight late doses", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  assert.notEqual(process.env.NODE_ENV, "production", "Use a development database only.");
  const { asAgency, db, schema, pool, systemPool } = await import("../src/server/db");
  const { agencyIdBySlug } = await import("../src/server/agency");
  const { todayOverview } = await import("../src/server/queries/dashboard");
  const agencyId = await agencyIdBySlug("milestone");
  assert.ok(agencyId, "The demo agency must exist.");
  await asAgency(agencyId, async () => {
  let personId: string | undefined;
  try {
    const before = await todayOverview();
    const [person] = await db.insert(schema.individuals).values({ firstName: "Regression", lastName: "Fixture", serviceType: "supported_living" }).returning();
    personId = person.id;
    const [med] = await db.insert(schema.medications).values({ individualId: person.id, name: "Test-only medication", dose: "test", times: ["23:59"] }).returning();
    const [empty] = await db.select({ n: count() }).from(schema.medAdministrations).where(eq(schema.medAdministrations.medicationId, med.id));
    assert.equal(empty.n, 0);
    await db.insert(schema.medAdministrations).values(Array.from({ length: 9 }, (_, i) => ({ medicationId: med.id, individualId: person.id, scheduledFor: zonedTime(addDays(dateKey(), -1), `00:${String(i).padStart(2, "0")}`) })));
    const after = await todayOverview();
    assert.equal(after.meds.total, before.meds.total + 1, "Today must generate the new daily dose itself");
    assert.ok(after.meds.late >= before.meds.late + 9, "Late total must not be truncated to the eight preview rows");
    assert.equal(after.lateMeds.length, 8, "The preview remains bounded");
    await todayOverview();
    const today = dateKey();
    const [generated] = await db.select({ n: count() }).from(schema.medAdministrations).where(and(eq(schema.medAdministrations.medicationId, med.id), gte(schema.medAdministrations.scheduledFor, zonedTime(today, "00:00")), lt(schema.medAdministrations.scheduledFor, zonedTime(addDays(today, 1), "00:00"))));
    assert.equal(generated.n, 1);
    const [unique] = await db.select({ n: count() }).from(schema.medAdministrations).where(and(eq(schema.medAdministrations.medicationId, med.id), eq(schema.medAdministrations.scheduledFor, zonedTime(today, "23:59"))));
    assert.equal(unique.n, 1, "Repeated dashboard loads must never duplicate doses");
  } finally {
    if (personId) await db.delete(schema.individuals).where(eq(schema.individuals.id, personId));
  }
  });
  await pool.end();
  await systemPool.end();
});
