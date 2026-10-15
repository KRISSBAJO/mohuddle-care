import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { asAgency, currentAgencyId, db, pool, schema, systemDb } from "./db";
import { noteProblem } from "./health-log";

export type Agency = typeof schema.agencies.$inferSelect;

const agencyById = cache(async (agencyId: string): Promise<Agency | null> => {
  if (!agencyId) return null;
  const [agency] = await db.select().from(schema.agencies).where(eq(schema.agencies.id, agencyId)).limit(1);
  return agency ?? null;
});

/* The agency this code is working for: its name, legal name and contact details. Null when there is none. */
export async function currentAgency(): Promise<Agency | null> {
  return agencyById(await currentAgencyId());
}

/* As currentAgency, for code that cannot run without one. */
export async function requireAgency(): Promise<Agency> {
  const agency = await currentAgency();
  if (!agency) throw new Error("No agency is set for this request.");
  return agency;
}

const bySlug = new Map<string, string>();

/* An agency's id from its web address name, such as "milestone". */
export async function agencyIdBySlug(slug: string) {
  const kept = bySlug.get(slug);
  if (kept) return kept;
  const [row] = await systemDb.select({ id: schema.agencies.id }).from(schema.agencies).where(eq(schema.agencies.slug, slug)).limit(1);
  if (row) bySlug.set(slug, row.id);
  return row?.id ?? null;
}

/* Runs fn once for each active agency, in turn, as that agency. Errors in one do not stop the others. */
export async function forEachAgency(label: string, fn: (agencyId: string) => Promise<number>) {
  const agencies = await systemDb.select({ id: schema.agencies.id, slug: schema.agencies.slug }).from(schema.agencies).where(eq(schema.agencies.active, true));
  let total = 0;
  for (const agency of agencies) {
    try {
      total += await asAgency(agency.id, async () => {
        // Checked with the database itself: a job that ran without its agency would see nothing and say nothing.
        const { rows } = await pool.query<{ agency: string }>("select current_setting('app.agency_id', true) as agency");
        if (rows[0]?.agency !== agency.id) throw new Error("The agency did not reach the database connection.");
        return fn(agency.id);
      });
    } catch (error) {
      console.error(`${label} failed for ${agency.slug}`, error);
      noteProblem(`${label}: ${agency.slug}`, error);
    }
  }
  return total;
}
