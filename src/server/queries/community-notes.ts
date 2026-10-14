import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/server/db";

const withStaff = alias(schema.staff, "with_staff");

/* One note with the person, the writer and anyone who was with them. */
export async function communityNoteRecord(id: string) {
  const [row] = await db
    .select({
      note: schema.communityNotes,
      first: schema.individuals.firstName,
      last: schema.individuals.lastName,
      home: schema.homes.name,
      staff: sql<string | null>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`,
      withStaff: sql<string | null>`${withStaff.firstName} || ' ' || ${withStaff.lastName}`,
    })
    .from(schema.communityNotes)
    .innerJoin(schema.individuals, eq(schema.individuals.id, schema.communityNotes.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .leftJoin(schema.staff, eq(schema.staff.id, schema.communityNotes.staffId))
    .leftJoin(withStaff, eq(withStaff.id, schema.communityNotes.withStaffId))
    .where(eq(schema.communityNotes.id, id))
    .limit(1);
  return row ?? null;
}

/* A person's latest notes, newest first. */
export async function communityNotesFor(individualId: string, limit = 8) {
  return db
    .select({ id: schema.communityNotes.id, noteDate: schema.communityNotes.noteDate, startTime: schema.communityNotes.startTime, endTime: schema.communityNotes.endTime, minutes: schema.communityNotes.minutes, activity: schema.communityNotes.activity, staff: sql<string | null>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}` })
    .from(schema.communityNotes)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.communityNotes.staffId))
    .where(eq(schema.communityNotes.individualId, individualId))
    .orderBy(desc(schema.communityNotes.noteDate), desc(schema.communityNotes.startTime))
    .limit(limit);
}
