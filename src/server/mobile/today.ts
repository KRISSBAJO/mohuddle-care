import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db, schema } from "@/server/db";
import type { SessionUser } from "@/server/auth";
import { notesOwed, owedTotals } from "@/server/queries/notes-owed";
import { clockInContext, openEntry, unreadHandovers } from "@/server/queries/timeclock";
import { getSettings } from "@/server/settings";

// Doses show on the phone's Today screen from this long before they are due to this long after.
const DOSE_AHEAD_MS = 2 * 3_600_000;
const DOSE_BEHIND_MS = 4 * 3_600_000;

/*
 * Everything the phone app's Today screen shows a staff member: their clock, the home they are at
 * (or about to be at), who lives there, doses coming up, notes they owe and their tasks.
 */
export async function staffToday(user: SessionUser, now: number) {
  const settings = await getSettings();
  const open = user.staffId ? await openEntry(user.staffId) : null;
  const context = user.staffId && !open ? await clockInContext(user.staffId, now, settings) : null;

  const clock = open
    ? {
        state: "on" as const,
        since: open.entry.clockInAt,
        home: open.home,
        shiftEndsAt: open.shiftEnd,
        onBreak: Boolean(open.openBreak),
      }
    : {
        state: "off" as const,
        shift: context?.shift ? { startsAt: context.shift.startsAt, endsAt: context.shift.endsAt, home: context.shift.home, pattern: context.shift.pattern } : null,
        next: context?.upcoming
          ? { startsAt: context.upcoming.startsAt, home: context.upcoming.home, pattern: context.upcoming.pattern }
          : context?.later
            ? { startsAt: context.later.startsAt, home: context.later.home, pattern: context.later.pattern }
            : null,
      };

  // The home that matters right now: where they are clocked in, or where their shift is.
  const homeId = open?.entry.homeId ?? context?.shift?.homeId ?? null;
  const [home] = homeId ? await db.select({ id: schema.homes.id, name: schema.homes.name }).from(schema.homes).where(eq(schema.homes.id, homeId)).limit(1) : [];

  const people = homeId
    ? await db
        .select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName, preferred: schema.individuals.preferredName })
        .from(schema.individuals)
        .where(and(eq(schema.individuals.homeId, homeId), eq(schema.individuals.active, true)))
        .orderBy(asc(schema.individuals.firstName))
    : [];
  const ids = people.map(person => person.id);

  const doses = ids.length
    ? await db
        .select({ id: schema.medAdministrations.id, individualId: schema.medAdministrations.individualId, scheduledFor: schema.medAdministrations.scheduledFor })
        .from(schema.medAdministrations)
        .where(
          and(
            inArray(schema.medAdministrations.individualId, ids),
            eq(schema.medAdministrations.status, "due"),
            gte(schema.medAdministrations.scheduledFor, new Date(now - DOSE_BEHIND_MS)),
            lte(schema.medAdministrations.scheduledFor, new Date(now + DOSE_AHEAD_MS)),
          ),
        )
        .orderBy(asc(schema.medAdministrations.scheduledFor))
    : [];
  // Grouped by the time they are due: "8:00 AM, 3 doses for 2 people".
  const rounds = new Map<number, { at: Date; doses: number; people: Set<string> }>();
  for (const dose of doses) {
    const key = dose.scheduledFor.getTime();
    const round = rounds.get(key) ?? { at: dose.scheduledFor, doses: 0, people: new Set<string>() };
    round.doses += 1;
    round.people.add(dose.individualId);
    rounds.set(key, round);
  }

  const owed = user.staffId ? owedTotals(await notesOwed({ from: new Date(now - 36 * 3_600_000), staffId: user.staffId })) : null;

  const tasks = user.staffId
    ? await db
        .select({ id: schema.tasks.id, title: schema.tasks.title, dueAt: schema.tasks.dueAt, priority: schema.tasks.priority })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.assignedTo, user.staffId),
            eq(schema.tasks.status, "open"),
            or(isNull(schema.tasks.dueAt), lte(schema.tasks.dueAt, new Date(now + 24 * 3_600_000))),
          ),
        )
        .orderBy(asc(schema.tasks.dueAt))
        .limit(10)
    : [];

  const handovers = user.staffId && homeId ? (await unreadHandovers(user.staffId, [homeId], now)).length : 0;

  return {
    clock,
    home: home ?? null,
    people: people.map(person => {
      const theirs = doses.filter(dose => dose.individualId === person.id);
      return {
        id: person.id,
        name: `${person.preferred || person.first} ${person.last}`,
        initials: `${(person.preferred || person.first)[0] ?? ""}${person.last[0] ?? ""}`.toUpperCase(),
        // Doses due in the Today window, and whether any is already late.
        dosesDue: theirs.length,
        doseLate: theirs.some(dose => dose.scheduledFor.getTime() < now - settings.med_late_minutes * 60_000),
      };
    }),
    doseRounds: [...rounds.values()].map(round => ({ at: round.at, doses: round.doses, people: round.people.size, late: round.at.getTime() < now - settings.med_late_minutes * 60_000 })),
    notes: owed ? { missing: owed.missing, overdue: owed.overdue } : null,
    tasks,
    handovers,
  };
}
