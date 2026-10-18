import "server-only";
import { eq } from "drizzle-orm";
import type { SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { clockInContext, clockOutContext, openEntry } from "@/server/queries/timeclock";
import { getSettings } from "@/server/settings";
import { officeSnapshot } from "@/server/office-work";

/*
 * What the phone app's clock screen needs: to clock in (the shift, homes, handovers to read and the
 * agency's rules) or, when on the clock, to clock out (the handover, what is still undone, the rules).
 */
export async function clockScreen(user: SessionUser, now: number) {
  if (!user.staffId) return { state: "none" as const };
  const settings = await getSettings();
  const open = await openEntry(user.staffId);
  if (open) {
    const office = open.entry.flags.includes("office_work") ? await officeSnapshot(open.entry.id) : null;
    const [context, [member]] = await Promise.all([
      clockOutContext(open, now, settings),
      db.select({ first: schema.staff.firstName, last: schema.staff.lastName }).from(schema.staff).where(eq(schema.staff.id, user.staffId)).limit(1),
    ]);
    return {
      state: "on" as const,
      entry: { clockInAt: open.entry.clockInAt, home: open.home, hasHome: Boolean(open.entry.homeId), office: open.entry.flags.includes("office_work"), shiftEndsAt: open.shiftEnd, onBreak: open.openBreak ? open.openBreak.kind : null },
      homePoint: { latitude: open.homeLatitude, longitude: open.homeLongitude },
      people: context.people.map(person => ({ id: person.id, name: `${person.first} ${person.last}`, noteWritten: person.noteWritten, dosesDue: person.dosesDue.map(dose => ({ medication: dose.medication, scheduledFor: dose.scheduledFor })) })),
      notesMissing: context.notesMissing,
      dosesMissing: context.dosesMissing,
      checklist: context.checklist,
      overstay: context.overstay,
      leftEarly: context.leftEarly,
      worked: context.worked,
      fullName: member ? `${member.first} ${member.last}` : user.name,
      rules: { blocking: settings.clock_out_blocking, minChars: settings.handover_min_chars, location: Boolean(office) || settings.clock_in_requirements.includes("location"), geofence: office?.radius ?? settings.clock_geofence_meters },
    };
  }
  const context = await clockInContext(user.staffId, now, settings);
  return {
    state: "off" as const,
    shift: context.shift ? { id: context.shift.id, startsAt: context.shift.startsAt, endsAt: context.shift.endsAt, homeId: context.shift.homeId, home: context.shift.home, pattern: context.shift.pattern } : null,
    next: context.upcoming
      ? { startsAt: context.upcoming.startsAt, home: context.upcoming.home }
      : context.later
        ? { startsAt: context.later.startsAt, home: context.later.home }
        : null,
    homes: context.homes,
    office: { available: !context.office.error, ...context.office },
    handovers: context.handovers.map(handover => ({ id: handover.id, homeId: handover.homeId, note: handover.note, people: handover.people, checks: handover.checks, incident: handover.incident, createdAt: handover.createdAt, staff: handover.staff })),
    rules: { requirements: settings.clock_in_requirements, statements: settings.clock_in_statements, geofence: settings.clock_geofence_meters, earlyMinutes: settings.clock_early_minutes },
  };
}
