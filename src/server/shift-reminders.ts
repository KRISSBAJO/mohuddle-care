import "server-only";
import { and, eq, gt, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { fmt } from "@/lib/format";
import { db, schema } from "@/server/db";
import { notify, recipients } from "@/server/notify";
import type { Settings } from "@/server/settings";

/*
 * Reminders to staff about their own time: a shift about to start, a shift about to end, still
 * clocked in after it ended, and a break about to end or over. Each goes out once (dedupe keys),
 * to the bell and, when switched on, to their phone. Each can be turned off by setting its minutes to 0.
 */
export async function shiftReminders(now: number, settings: Settings) {
  let sent = 0;
  const tell = async (staffId: string, message: Parameters<typeof notify>[1]) => (sent += await notify(await recipients({ staffIds: [staffId] }), message));
  const at = (minutes: number) => new Date(now + minutes * 60_000);

  // A shift starting soon that they have not clocked in for.
  if (settings.remind_shift_start_minutes > 0) {
    const soon = await db
      .select({ id: schema.shifts.id, staffId: schema.shifts.staffId, startsAt: schema.shifts.startsAt, home: schema.homes.name, pattern: schema.shiftPatterns.name })
      .from(schema.shifts)
      .innerJoin(schema.homes, eq(schema.homes.id, schema.shifts.homeId))
      .leftJoin(schema.shiftPatterns, eq(schema.shiftPatterns.id, schema.shifts.patternId))
      .where(and(isNotNull(schema.shifts.staffId), ne(schema.shifts.status, "missed"), gt(schema.shifts.startsAt, new Date(now)), lte(schema.shifts.startsAt, at(settings.remind_shift_start_minutes))));
    const clockedIn = soon.length
      ? await db.select({ staffId: schema.timeEntries.staffId }).from(schema.timeEntries).where(and(isNull(schema.timeEntries.clockOutAt), inArray(schema.timeEntries.staffId, soon.map(shift => shift.staffId!))))
      : [];
    for (const shift of soon.filter(item => !clockedIn.some(row => row.staffId === item.staffId))) {
      await tell(shift.staffId!, {
        kind: "time:starting",
        title: `Your shift at ${shift.home} starts at ${fmt.time(shift.startsAt)}`,
        body: `${shift.pattern ? `${shift.pattern}. ` : ""}You can clock in up to ${settings.clock_early_minutes} minutes before.`,
        href: "/app/clock/in",
        tone: "info",
        dedupeKey: `time:starting:${shift.id}`,
      });
    }
  }

  // Open punches with their shift: ending soon, or ended a while ago.
  const open = await db
    .select({ id: schema.timeEntries.id, staffId: schema.timeEntries.staffId, endsAt: schema.shifts.endsAt, home: schema.homes.name })
    .from(schema.timeEntries)
    .leftJoin(schema.shifts, eq(schema.shifts.id, schema.timeEntries.shiftId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.timeEntries.homeId))
    .where(isNull(schema.timeEntries.clockOutAt));
  for (const entry of open) {
    if (!entry.endsAt) continue;
    const toEnd = entry.endsAt.getTime() - now;
    if (settings.remind_shift_end_minutes > 0 && toEnd > 0 && toEnd <= settings.remind_shift_end_minutes * 60_000) {
      await tell(entry.staffId, {
        kind: "time:ending",
        title: `Your shift ends at ${fmt.time(entry.endsAt)}`,
        body: "Finish your daily notes, record any doses and write the handover before you clock out.",
        href: "/app/clock",
        tone: "info",
        dedupeKey: `time:ending:${entry.id}`,
      });
    }
    if (settings.remind_still_clocked_minutes > 0 && -toEnd >= settings.remind_still_clocked_minutes * 60_000 && -toEnd < settings.clock_forgot_hours * 3_600_000) {
      await tell(entry.staffId, {
        kind: "time:overstay",
        title: "You are still clocked in",
        body: `Your shift at ${entry.home ?? "work"} ended at ${fmt.time(entry.endsAt)}. Clock out when you leave.`,
        href: "/app/clock/out",
        tone: "warn",
        dedupeKey: `time:overstay:${entry.id}`,
      });
    }
  }

  // Breaks: about to end, then over.
  if (open.length) {
    const breaks = await db
      .select({ id: schema.timeBreaks.id, kind: schema.timeBreaks.kind, startAt: schema.timeBreaks.startAt, staffId: schema.timeEntries.staffId })
      .from(schema.timeBreaks)
      .innerJoin(schema.timeEntries, eq(schema.timeEntries.id, schema.timeBreaks.entryId))
      .where(and(isNull(schema.timeBreaks.endAt), inArray(schema.timeBreaks.entryId, open.map(entry => entry.id))));
    for (const item of breaks) {
      const length = item.kind === "meal" ? settings.break_meal_minutes : settings.break_rest_minutes;
      const endsAt = new Date(item.startAt.getTime() + length * 60_000);
      const left = endsAt.getTime() - now;
      if (settings.remind_break_end_minutes > 0 && left > 0 && left <= settings.remind_break_end_minutes * 60_000) {
        await tell(item.staffId, {
          kind: "time:break-ending",
          title: `Your break ends at ${fmt.time(endsAt)}`,
          body: `${Math.ceil(left / 60_000)} minutes left of your ${length}-minute ${item.kind} break.`,
          href: "/app/clock",
          tone: "info",
          dedupeKey: `time:break-ending:${item.id}`,
        });
      }
      if (left <= 0) {
        await tell(item.staffId, {
          kind: "time:break-over",
          title: "Your break is over",
          body: `Your ${length}-minute ${item.kind} break ended at ${fmt.time(endsAt)}. End it in Mohuddle when you are back.`,
          href: "/app/clock",
          tone: "warn",
          dedupeKey: `time:break-over:${item.id}`,
        });
      }
    }
  }
  return sent;
}
