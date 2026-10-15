import "server-only";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { addDays, dateKey } from "@/lib/format";
import { goalProgress } from "@/lib/goal-progress";
import type { Huddle } from "@/lib/huddle";
import { db, schema } from "@/server/db";
import { clockInContext, clockOutContext, openEntry } from "@/server/queries/timeclock";
import type { Settings } from "@/server/settings";

/*
 * The shift huddle: what someone needs to know for the shift they are on or about to start, at
 * that home. Who they support (and allergies), doses due, appointments, the last handover, recent
 * incidents and plan goals still to work on this week. One function for the web and the mobile app.
 */
export async function shiftHuddle(staffId: string, now: number, settings: Settings): Promise<Huddle | null> {
  const open = await openEntry(staffId);
  let homeId: string | null = open?.entry.homeId ?? null;
  let home = open?.home ?? null;
  let start = open?.entry.clockInAt ?? null;
  let end = open?.shiftEnd ?? null;
  if (!open) {
    const context = await clockInContext(staffId, now, settings);
    const shift = context.shift ?? context.upcoming;
    if (!shift) return null;
    homeId = shift.homeId;
    home = shift.home;
    start = shift.startsAt;
    end = shift.endsAt;
  }
  if (!homeId) return null;
  const from = new Date(Math.min(now, start?.getTime() ?? now));
  const until = end && end.getTime() > now ? end : new Date(now + 8 * 3_600_000);

  const people = await db
    .select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName, preferred: schema.individuals.preferredName, allergies: schema.individuals.allergies, diet: schema.individuals.diet, mobility: schema.individuals.mobility, supportNotes: schema.individuals.supportNotes })
    .from(schema.individuals)
    .where(and(eq(schema.individuals.homeId, homeId), eq(schema.individuals.active, true)))
    .orderBy(asc(schema.individuals.firstName));
  const ids = people.map(person => person.id);
  const today = dateKey(new Date(now));

  const [doses, visits, handovers, incidents, goals, worked] = ids.length
    ? await Promise.all([
        db
          .select({ individualId: schema.medAdministrations.individualId, at: schema.medAdministrations.scheduledFor, name: schema.medications.name, dose: schema.medications.dose })
          .from(schema.medAdministrations)
          .innerJoin(schema.medications, eq(schema.medications.id, schema.medAdministrations.medicationId))
          .where(and(inArray(schema.medAdministrations.individualId, ids), eq(schema.medAdministrations.status, "due"), gte(schema.medAdministrations.scheduledFor, new Date(now - 3 * 3_600_000)), lte(schema.medAdministrations.scheduledFor, until)))
          .orderBy(asc(schema.medAdministrations.scheduledFor)),
        db
          .select({ individualId: schema.appointments.individualId, at: schema.appointments.scheduledAt, type: schema.appointments.type, provider: schema.appointments.provider, clinic: schema.appointments.clinic, escortFirst: schema.staff.firstName, escortLast: schema.staff.lastName })
          .from(schema.appointments)
          .leftJoin(schema.staff, eq(schema.staff.id, schema.appointments.escortStaffId))
          .where(and(inArray(schema.appointments.individualId, ids), eq(schema.appointments.status, "scheduled"), gte(schema.appointments.scheduledAt, from), lte(schema.appointments.scheduledAt, until)))
          .orderBy(asc(schema.appointments.scheduledAt)),
        db
          .select({ note: schema.handovers.note, people: schema.handovers.people, incident: schema.handovers.incident, at: schema.handovers.createdAt, first: schema.staff.firstName, last: schema.staff.lastName, staffId: schema.handovers.staffId })
          .from(schema.handovers)
          .leftJoin(schema.staff, eq(schema.staff.id, schema.handovers.staffId))
          .where(and(eq(schema.handovers.homeId, homeId), gte(schema.handovers.createdAt, new Date(now - 24 * 3_600_000))))
          .orderBy(desc(schema.handovers.createdAt))
          .limit(3),
        db
          .select({ individualId: schema.incidents.individualId, at: schema.incidents.occurredAt, category: schema.incidents.category, severity: schema.incidents.severity, status: schema.incidents.status })
          .from(schema.incidents)
          .where(and(inArray(schema.incidents.individualId, ids), gte(schema.incidents.occurredAt, new Date(now - 72 * 3_600_000))))
          .orderBy(desc(schema.incidents.occurredAt)),
        db
          .select({ id: schema.planGoals.id, individualId: schema.planGoals.individualId, title: schema.planGoals.title, count: schema.planGoals.frequencyCount, period: schema.planGoals.frequencyPeriod })
          .from(schema.planGoals)
          .where(and(inArray(schema.planGoals.individualId, ids), eq(schema.planGoals.status, "active"))),
        db
          .selectDistinct({ goalId: schema.dailyLogGoals.goalId, day: schema.dailyLogs.logDate })
          .from(schema.dailyLogGoals)
          .innerJoin(schema.dailyLogs, eq(schema.dailyLogs.id, schema.dailyLogGoals.logId))
          .where(and(inArray(schema.dailyLogs.individualId, ids), eq(schema.dailyLogGoals.offered, "yes"), gte(schema.dailyLogs.logDate, addDays(today, -31)))),
      ])
    : [[], [], [], [], [], []];

  // The last handover by someone else is the one to read; earlier ones add people notes.
  const last = handovers.find(item => item.staffId !== staffId) ?? handovers[0] ?? null;

  return {
    home: home ?? "",
    state: open ? "on" : "upcoming",
    start: start?.toISOString() ?? null,
    end: end?.toISOString() ?? null,
    people: people.map(person => {
      const goalsBehind = goals
        .filter(goal => goal.individualId === person.id && goal.count)
        .map(goal => ({ title: goal.title, progress: goalProgress(worked.filter(row => row.goalId === goal.id).map(row => row.day), goal.count, goal.period, today) }))
        .filter(goal => !goal.progress.met)
        .map(goal => ({ title: goal.title, label: goal.progress.label }));
      return {
        id: person.id,
        name: person.preferred || person.first,
        fullName: `${person.first} ${person.last}`,
        allergies: person.allergies,
        diet: person.diet,
        mobility: person.mobility,
        supportNotes: person.supportNotes,
        doses: doses.filter(dose => dose.individualId === person.id).map(dose => ({ at: dose.at.toISOString(), name: dose.name, dose: dose.dose, late: dose.at.getTime() < now - settings.med_late_minutes * 60_000 })),
        appointments: visits.filter(visit => visit.individualId === person.id).map(visit => ({ at: visit.at.toISOString(), what: [visit.type, visit.provider || visit.clinic].filter(Boolean).join(" with "), escort: visit.escortFirst ? `${visit.escortFirst} ${visit.escortLast}` : null })),
        incidents: incidents.filter(item => item.individualId === person.id).map(item => ({ at: item.at.toISOString(), category: item.category, severity: item.severity, open: item.status !== "closed" })),
        handoverNote: last?.people.find(entry => entry.individualId === person.id)?.note ?? "",
        goals: goalsBehind,
      };
    }),
    handover: last ? { from: last.first ? `${last.first} ${last.last}` : "The last shift", at: last.at.toISOString(), note: last.note, incident: last.incident } : null,
  };
}

export type WrapUp = {
  endsAt: string | null;
  minutesLeft: number | null;
  notes: { id: string; name: string }[];
  doses: { person: string; name: string; at: string }[];
  ready: boolean;
};

/*
 * End of shift: what is left before clocking out (notes to write, doses not recorded), shown in the
 * last stretch of the shift. Null when not clocked in, or when the shift is not near its end.
 */
export async function shiftWrapUp(staffId: string, now: number, settings: Settings, always = false): Promise<WrapUp | null> {
  const open = await openEntry(staffId);
  if (!open) return null;
  const minutesLeft = open.shiftEnd ? Math.round((open.shiftEnd.getTime() - now) / 60_000) : null;
  const window = Math.max(45, settings.remind_shift_end_minutes);
  if (!always && minutesLeft !== null && minutesLeft > window) return null;
  const context = await clockOutContext(open, now, settings);
  const notes = context.people.filter(person => !person.noteWritten).map(person => ({ id: person.id, name: `${person.first} ${person.last}` }));
  const doses = context.people.flatMap(person => person.dosesDue.map(dose => ({ person: person.first, name: dose.medication, at: dose.scheduledFor.toISOString() })));
  return { endsAt: open.shiftEnd?.toISOString() ?? null, minutesLeft, notes, doses, ready: !notes.length && !doses.length };
}
