import "server-only";
import { aliasedTable, and, asc, desc, eq, ilike, isNull, lt, gte, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/server/db";

export const appointmentViews = {
  upcoming: "Upcoming",
  document: "Needs documenting",
  followup: "Follow-ups to book",
  past: "Past",
} as const;
export type AppointmentView = keyof typeof appointmentViews;

const escort = aliasedTable(schema.staff, "escort");
const columns = {
  id: schema.appointments.id,
  individualId: schema.appointments.individualId,
  type: schema.appointments.type,
  provider: schema.appointments.provider,
  clinic: schema.appointments.clinic,
  scheduledAt: schema.appointments.scheduledAt,
  durationMinutes: schema.appointments.durationMinutes,
  reason: schema.appointments.reason,
  status: schema.appointments.status,
  statusReason: schema.appointments.statusReason,
  documentedAt: schema.appointments.documentedAt,
  followUpNeeded: schema.appointments.followUpNeeded,
  followUpBy: schema.appointments.followUpBy,
  nextAppointmentId: schema.appointments.nextAppointmentId,
  medicationChanges: schema.appointments.medicationChanges,
  summary: schema.appointments.summary,
  first: schema.individuals.firstName,
  last: schema.individuals.lastName,
  homeId: schema.individuals.homeId,
  home: schema.homes.name,
  escortStaffId: schema.appointments.escortStaffId,
  escort: sql<string | null>`${escort.firstName} || ' ' || ${escort.lastName}`,
};

function viewWhere(view: AppointmentView): SQL | undefined {
  const now = new Date();
  if (view === "upcoming") return and(eq(schema.appointments.status, "scheduled"), gte(schema.appointments.scheduledAt, now));
  if (view === "document") return and(eq(schema.appointments.status, "scheduled"), lt(schema.appointments.scheduledAt, now));
  if (view === "followup") return and(eq(schema.appointments.status, "completed"), eq(schema.appointments.followUpNeeded, true), isNull(schema.appointments.nextAppointmentId));
  return or(sql`${schema.appointments.status} <> 'scheduled'`, lt(schema.appointments.scheduledAt, now));
}

/* Appointments for a list: one view, optionally one home, one person or a search on person, type or provider. */
export function listAppointments(options: { view: AppointmentView; homeId?: string; personId?: string; q?: string; limit?: number }) {
  const term = options.q?.trim();
  return db
    .select(columns)
    .from(schema.appointments)
    .innerJoin(schema.individuals, eq(schema.individuals.id, schema.appointments.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .leftJoin(escort, eq(escort.id, schema.appointments.escortStaffId))
    .where(
      and(
        viewWhere(options.view),
        options.homeId ? eq(schema.individuals.homeId, options.homeId) : undefined,
        options.personId ? eq(schema.appointments.individualId, options.personId) : undefined,
        term
          ? or(
              ilike(sql`${schema.individuals.firstName} || ' ' || ${schema.individuals.lastName}`, `%${term}%`),
              ilike(schema.appointments.type, `%${term}%`),
              ilike(schema.appointments.provider, `%${term}%`),
              ilike(schema.appointments.clinic, `%${term}%`),
            )
          : undefined,
      ),
    )
    .orderBy(options.view === "upcoming" || options.view === "document" ? asc(schema.appointments.scheduledAt) : options.view === "followup" ? asc(schema.appointments.followUpBy) : desc(schema.appointments.scheduledAt))
    .limit(options.limit ?? 200);
}

/* How many appointments are in each view, for the tab badges. */
export async function appointmentCounts(options: { homeId?: string; personId?: string } = {}) {
  const scope = and(options.homeId ? eq(schema.individuals.homeId, options.homeId) : undefined, options.personId ? eq(schema.appointments.individualId, options.personId) : undefined);
  const count = async (view: AppointmentView) => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.appointments)
      .innerJoin(schema.individuals, eq(schema.individuals.id, schema.appointments.individualId))
      .where(and(viewWhere(view), scope));
    return row?.n ?? 0;
  };
  const [upcoming, document, followup] = await Promise.all([count("upcoming"), count("document"), count("followup")]);
  return { upcoming, document, followup };
}

/* One appointment with everything the detail page and the visit sheet need. */
export async function appointmentDetail(id: string) {
  const creator = aliasedTable(schema.users, "creator");
  const documenter = aliasedTable(schema.users, "documenter");
  const [row] = await db
    .select({
      appointment: schema.appointments,
      person: schema.individuals,
      home: schema.homes.name,
      escort: sql<string | null>`${escort.firstName} || ' ' || ${escort.lastName}`,
      escortPhone: escort.phone,
      createdBy: creator.name,
      documentedBy: documenter.name,
    })
    .from(schema.appointments)
    .innerJoin(schema.individuals, eq(schema.individuals.id, schema.appointments.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .leftJoin(escort, eq(escort.id, schema.appointments.escortStaffId))
    .leftJoin(creator, eq(creator.id, schema.appointments.createdBy))
    .leftJoin(documenter, eq(documenter.id, schema.appointments.documentedBy))
    .where(eq(schema.appointments.id, id))
    .limit(1);
  if (!row) return null;
  const linkedIds = [row.appointment.followUpOf, row.appointment.nextAppointmentId].filter((value): value is string => Boolean(value));
  const [linked, meds, history] = await Promise.all([
    linkedIds.length
      ? db.select({ id: schema.appointments.id, type: schema.appointments.type, scheduledAt: schema.appointments.scheduledAt, status: schema.appointments.status }).from(schema.appointments).where(or(...linkedIds.map(linkedId => eq(schema.appointments.id, linkedId))))
      : [],
    db.select().from(schema.medications).where(and(eq(schema.medications.individualId, row.person.id), eq(schema.medications.active, true))).orderBy(asc(schema.medications.name)),
    db
      .select({ id: schema.appointments.id, type: schema.appointments.type, provider: schema.appointments.provider, scheduledAt: schema.appointments.scheduledAt, status: schema.appointments.status })
      .from(schema.appointments)
      .where(and(eq(schema.appointments.individualId, row.person.id), sql`${schema.appointments.id} <> ${id}`, eq(schema.appointments.type, row.appointment.type)))
      .orderBy(desc(schema.appointments.scheduledAt))
      .limit(5),
  ]);
  return {
    ...row,
    followUpOf: linked.find(item => item.id === row.appointment.followUpOf) ?? null,
    next: linked.find(item => item.id === row.appointment.nextAppointmentId) ?? null,
    meds,
    history,
  };
}

/* The next booked appointment for a person, for their overview. */
export async function nextAppointmentFor(personId: string) {
  const [row] = await db
    .select(columns)
    .from(schema.appointments)
    .innerJoin(schema.individuals, eq(schema.individuals.id, schema.appointments.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .leftJoin(escort, eq(escort.id, schema.appointments.escortStaffId))
    .where(and(eq(schema.appointments.individualId, personId), eq(schema.appointments.status, "scheduled"), gte(schema.appointments.scheduledAt, new Date())))
    .orderBy(asc(schema.appointments.scheduledAt))
    .limit(1);
  return row ?? null;
}

