import "server-only";
import { and, count, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { addDays, dateKey, zonedTime } from "@/lib/format";
import { db, schema } from "@/server/db";
import { notify, recipients, type Role } from "@/server/notify";
import { notesOwed } from "@/server/queries/notes-owed";
import type { Settings } from "@/server/settings";

export type DigestLine = { text: string; href: string; tone: "bad" | "warn" | "info" };

/*
 * The morning summary for managers: what went wrong yesterday and what today needs, in a few
 * lines, each linking to where it is dealt with. One function for the bell, push and the mobile app.
 */
export async function morningDigest(now: number): Promise<DigestLine[]> {
  const today = dateKey(new Date(now));
  const yesterday = addDays(today, -1);
  const dayStart = zonedTime(yesterday, "00:00");
  const todayStart = zonedTime(today, "00:00");
  const tomorrowStart = zonedTime(addDays(today, 1), "00:00");
  const lines: DigestLine[] = [];

  const owed = await notesOwed({ from: dayStart, to: todayStart });
  const missing = owed.reduce((sum, shift) => sum + shift.people.filter(person => !person.logId).length, 0);
  const overdue = owed.filter(shift => shift.state === "overdue").reduce((sum, shift) => sum + shift.people.filter(person => !person.logId).length, 0);
  if (missing) lines.push({ text: `${missing} daily ${missing === 1 ? "note" : "notes"} from yesterday not written${overdue ? `, ${overdue} overdue` : ""}.`, href: "/app/daily-logs?view=owed", tone: overdue ? "bad" : "warn" });

  const [[reviewDaily], [reviewCommunity], [doses], [missed], [openShifts], visits, [flagged], [corrections], tier1] = await Promise.all([
    db.select({ n: count() }).from(schema.dailyLogs).where(and(eq(schema.dailyLogs.reviewStatus, "submitted"), gte(schema.dailyLogs.logDate, addDays(today, -29)))),
    db.select({ n: count() }).from(schema.communityNotes).where(and(eq(schema.communityNotes.reviewStatus, "submitted"), gte(schema.communityNotes.noteDate, addDays(today, -29)))),
    db.select({ n: count() }).from(schema.medAdministrations).where(and(or(eq(schema.medAdministrations.status, "due"), eq(schema.medAdministrations.status, "missed")), gte(schema.medAdministrations.scheduledFor, dayStart), lt(schema.medAdministrations.scheduledFor, todayStart))),
    db.select({ n: count() }).from(schema.shifts).where(and(eq(schema.shifts.status, "missed"), gte(schema.shifts.startsAt, dayStart), lt(schema.shifts.startsAt, todayStart))),
    db.select({ n: count() }).from(schema.shifts).where(and(eq(schema.shifts.status, "open"), gte(schema.shifts.startsAt, todayStart), lt(schema.shifts.startsAt, tomorrowStart))),
    db.select({ id: schema.appointments.id, escort: schema.appointments.escortStaffId }).from(schema.appointments).where(and(eq(schema.appointments.status, "scheduled"), gte(schema.appointments.scheduledAt, todayStart), lt(schema.appointments.scheduledAt, tomorrowStart))),
    db.select({ n: count() }).from(schema.timeEntries).where(and(isNull(schema.timeEntries.reviewedAt), gte(schema.timeEntries.clockInAt, zonedTime(addDays(today, -7), "00:00")), sql`jsonb_array_length(${schema.timeEntries.flags}) > 0`)),
    db.select({ n: count() }).from(schema.timeCorrections).where(eq(schema.timeCorrections.status, "pending")),
    db.select({ id: schema.incidents.id, notifications: schema.incidents.notifications }).from(schema.incidents).where(and(eq(schema.incidents.tier, "tier1"), ne(schema.incidents.status, "closed"), gte(schema.incidents.occurredAt, new Date(now - 7 * 86_400_000)))),
  ]);

  const toReview = (reviewDaily?.n ?? 0) + (reviewCommunity?.n ?? 0);
  if (doses?.n) lines.push({ text: `${doses.n} ${doses.n === 1 ? "dose" : "doses"} yesterday missed or not recorded.`, href: "/app/medications", tone: "bad" });
  if (missed?.n) lines.push({ text: `${missed.n} ${missed.n === 1 ? "shift" : "shifts"} yesterday marked as no-show.`, href: "/app/time", tone: "bad" });
  const unreported = tier1.filter(item => !item.notifications.some(entry => /investigat|didd/i.test(entry.party) && entry.at));
  if (unreported.length) lines.push({ text: `${unreported.length} Tier 1 ${unreported.length === 1 ? "incident has" : "incidents have"} no DIDD Investigations notice recorded.`, href: "/app/incidents", tone: "bad" });
  if (openShifts?.n) lines.push({ text: `${openShifts.n} open ${openShifts.n === 1 ? "shift" : "shifts"} today with nobody assigned.`, href: "/app/schedule", tone: "warn" });
  const noEscort = visits.filter(visit => !visit.escort).length;
  if (visits.length) lines.push({ text: `${visits.length} ${visits.length === 1 ? "appointment" : "appointments"} today${noEscort ? `, ${noEscort} without an escort` : ""}.`, href: "/app/appointments", tone: noEscort ? "warn" : "info" });
  if (toReview) lines.push({ text: `${toReview} ${toReview === 1 ? "note" : "notes"} waiting for review.`, href: "/app/daily-logs?view=review", tone: "info" });
  if (flagged?.n || corrections?.n) lines.push({ text: [flagged?.n ? `${flagged.n} flagged ${flagged.n === 1 ? "punch" : "punches"} to review` : "", corrections?.n ? `${corrections.n} punch ${corrections.n === 1 ? "correction" : "corrections"} to approve` : ""].filter(Boolean).join(" and ") + ".", href: "/app/time", tone: "info" });
  return lines;
}

/* Sends the morning summary once a day, at or after the set hour, to the chosen roles. */
export async function sendMorningDigest(now: number, settings: Settings) {
  if (settings.digest_hour < 0) return 0;
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", hourCycle: "h23" }).format(new Date(now)));
  if (hour < settings.digest_hour) return 0;
  const today = dateKey(new Date(now));
  const ids = await recipients({ roles: settings.digest_roles as Role[] });
  if (!ids.length) return 0;
  // Skip the work when everyone already has today's summary.
  const [sent] = await db.select({ n: count() }).from(schema.notifications).where(and(eq(schema.notifications.dedupeKey, `digest:${today}`), inArray(schema.notifications.userId, ids)));
  if ((sent?.n ?? 0) >= ids.length) return 0;
  const lines = await morningDigest(now);
  const urgent = lines.filter(line => line.tone === "bad").length;
  return notify(ids, {
    kind: "digest",
    title: lines.length ? `Good morning: ${lines.length} ${lines.length === 1 ? "thing needs" : "things need"} you today` : "Good morning: nothing needs you today",
    body: lines.map(line => line.text).join(" ") || "Notes, doses and shifts from yesterday are all in order.",
    href: "/app",
    tone: urgent ? "warn" : "info",
    dedupeKey: `digest:${today}`,
  });
}
