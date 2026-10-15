import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { DEMO_CONTACTS, DEMO_INSURANCE } from "../src/lib/demo-care-team";
import * as schema from "../src/server/db/schema";
import { agencyDb } from "./agency-db";

/* Adds the example care teams and insurance to an existing demo database, once. */
const { pool, db } = agencyDb();
const addDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function main() {
  for (const first of Object.keys(DEMO_CONTACTS) as (keyof typeof DEMO_CONTACTS)[]) {
    const [person] = await db.select().from(schema.individuals).where(and(eq(schema.individuals.firstName, first), eq(schema.individuals.active, true))).limit(1);
    if (!person) continue;
    const existing = await db.select({ id: schema.personContacts.id }).from(schema.personContacts).where(eq(schema.personContacts.individualId, person.id)).limit(1);
    if (existing.length) continue;
    await db.insert(schema.personContacts).values(DEMO_CONTACTS[first].map(contact => ({ ...contact, individualId: person.id })));
    await db.insert(schema.personInsurance).values(
      DEMO_INSURANCE[first].map(({ renewInDays, ...cover }) => ({ ...cover, individualId: person.id, effectiveTo: renewInDays === null ? null : addDays(renewInDays) })),
    );
    console.log(`Added care team and insurance for ${first}.`);
  }
  await pool.end();
}

main().catch(async error => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
