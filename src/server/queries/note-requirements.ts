import "server-only";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { effectiveConfig, type NoteConfig, type RequirementRow } from "@/lib/note-requirements";
import { db, schema } from "@/server/db";

const order = [asc(schema.noteRequirements.sortOrder), asc(schema.noteRequirements.createdAt)];

type Row = typeof schema.noteRequirements.$inferSelect;
const toRule = (row: Row): RequirementRow => ({ ...row, scope: row.scope, kind: row.kind });

/* Rows set at exactly one level: agency-wide, one home, or one person. */
export function requirementsAt(scope: "all" | "home" | "person", targetId: string | null) {
  return db
    .select()
    .from(schema.noteRequirements)
    .where(
      scope === "all"
        ? eq(schema.noteRequirements.scope, "all")
        : scope === "home"
          ? and(eq(schema.noteRequirements.scope, "home"), eq(schema.noteRequirements.homeId, targetId!))
          : and(eq(schema.noteRequirements.scope, "person"), eq(schema.noteRequirements.individualId, targetId!)),
    )
    .orderBy(...order);
}

/* The note each person gets, for many people at once. People without a home use the agency default and their own rows. */
export async function configsForPeople(people: { id: string; homeId: string | null }[]): Promise<Record<string, NoteConfig>> {
  const homeIds = [...new Set(people.map(person => person.homeId).filter((id): id is string => Boolean(id)))];
  const rows = await db
    .select()
    .from(schema.noteRequirements)
    .where(
      or(
        eq(schema.noteRequirements.scope, "all"),
        homeIds.length ? inArray(schema.noteRequirements.homeId, homeIds) : undefined,
        people.length ? inArray(schema.noteRequirements.individualId, people.map(person => person.id)) : undefined,
      ),
    )
    .orderBy(...order);
  const result: Record<string, NoteConfig> = {};
  for (const person of people) {
    result[person.id] = effectiveConfig(
      rows.filter(row => row.scope === "all" || (row.scope === "home" && row.homeId === person.homeId) || (row.scope === "person" && row.individualId === person.id)).map(toRule),
    );
  }
  return result;
}

/* The note for one level, ignoring anything set below it: the agency default, or the agency plus one home. */
export async function configAbove(homeId: string | null): Promise<NoteConfig> {
  const rows = await db
    .select()
    .from(schema.noteRequirements)
    .where(or(eq(schema.noteRequirements.scope, "all"), homeId ? and(eq(schema.noteRequirements.scope, "home"), eq(schema.noteRequirements.homeId, homeId)) : isNull(schema.noteRequirements.id)))
    .orderBy(...order);
  return effectiveConfig(rows.map(toRule));
}

export async function configForPerson(person: { id: string; homeId: string | null }) {
  return (await configsForPeople([person]))[person.id];
}
