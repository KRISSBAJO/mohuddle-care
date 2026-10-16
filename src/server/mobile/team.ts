import "server-only";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { dateKey, daysBetween, label } from "@/lib/format";
import { flagLabel } from "@/lib/timeclock";
import { db, schema } from "@/server/db";
import { photosFor } from "@/server/incident-photos";
import { incidentRecord } from "@/server/queries/incidents";
import { timeOffBoard } from "@/server/queries/pay";
import { liveBoard } from "@/server/queries/timeclock";
import type { Settings } from "@/server/settings";

/*
 * The manager's phone: who needs a call now, who is on shift at each home, new incidents, and what is
 * waiting for a decision. The numbers come from the same queries as the website's Time and Incidents pages.
 */

const staffName = sql<string>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`;

/* Signed timesheets in pay periods that are not locked yet: ready to approve. */
async function signedTimesheets() {
  return db
    .select({ periodId: schema.payPeriods.id, start: schema.payPeriods.startDate, end: schema.payPeriods.endDate, staffId: schema.timesheets.staffId, staff: staffName, signedAt: schema.timesheets.signedAt, totals: schema.timesheets.signedTotals })
    .from(schema.timesheets)
    .innerJoin(schema.payPeriods, eq(schema.payPeriods.id, schema.timesheets.periodId))
    .innerJoin(schema.staff, eq(schema.staff.id, schema.timesheets.staffId))
    .where(and(eq(schema.timesheets.status, "signed"), ne(schema.payPeriods.status, "locked")))
    .orderBy(asc(schema.payPeriods.startDate), asc(schema.staff.lastName));
}

export async function teamNow(now: number, settings: Settings) {
  const [board, timeOff, sheets, incidents, reviewing] = await Promise.all([
    liveBoard(now, settings),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.timeOffRequests).where(eq(schema.timeOffRequests.status, "pending")),
    signedTimesheets(),
    db
      .select({
        id: schema.incidents.id,
        occurredAt: schema.incidents.occurredAt,
        category: schema.incidents.category,
        severity: schema.incidents.severity,
        reportable: schema.incidents.reportable,
        filed: sql<boolean>`${schema.incidents.stateFiledAt} is not null`,
        person: sql<string | null>`${schema.individuals.firstName} || ' ' || ${schema.individuals.lastName}`,
        home: schema.homes.name,
        reporter: staffName,
      })
      .from(schema.incidents)
      .leftJoin(schema.individuals, eq(schema.individuals.id, schema.incidents.individualId))
      .leftJoin(schema.homes, eq(schema.homes.id, schema.incidents.homeId))
      .leftJoin(schema.staff, eq(schema.staff.id, schema.incidents.reportedBy))
      .where(eq(schema.incidents.status, "open"))
      .orderBy(desc(schema.incidents.occurredAt))
      .limit(10),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.incidents).where(eq(schema.incidents.status, "under_review")),
  ]);

  // Phone numbers for everyone a manager may need to call.
  const callIds = [...new Set([...board.forgotten, ...board.open.filter(row => row.inLocation === "outside")].map(row => row.staffId))];
  const phones = new Map(
    callIds.length ? (await db.select({ id: schema.staff.id, phone: schema.staff.phone }).from(schema.staff).where(inArray(schema.staff.id, callIds))).map(row => [row.id, row.phone ?? ""]) : [],
  );

  const forgotten = new Set(board.forgotten.map(row => row.id));
  const needs = [
    ...board.noShows.map(shift => ({ key: `ns-${shift.id}`, kind: "no_show" as const, staff: shift.staff, phone: shift.phone ?? "", home: shift.home, what: shift.pattern ?? "Shift", at: shift.startsAt })),
    ...board.lateNotIn.map(shift => ({ key: `late-${shift.id}`, kind: "late" as const, staff: shift.staff, phone: shift.phone ?? "", home: shift.home, what: shift.pattern ?? "Shift", at: shift.startsAt })),
    ...board.forgotten.map(row => ({ key: `fg-${row.id}`, kind: "forgot_out" as const, staff: row.staff, phone: phones.get(row.staffId) ?? "", home: row.home ?? "", what: row.pattern ?? "Shift", at: row.shiftEnd ?? row.clockInAt })),
    ...board.open
      .filter(row => row.inLocation === "outside" && !forgotten.has(row.id) && !row.reviewedAt)
      .map(row => ({ key: `away-${row.id}`, kind: "away" as const, staff: row.staff, phone: phones.get(row.staffId) ?? "", home: row.home ?? "", what: row.pattern ?? "Shift", at: row.clockInAt })),
  ];

  const deadline = (at: Date) => new Date(at.getTime() + settings.incident_report_hours * 3_600_000);
  return {
    needs,
    homes: board.byHome
      .filter(home => home.on.length || home.expected)
      .map(home => ({
        id: home.id,
        name: home.name,
        expected: home.expected,
        on: home.on.map(row => ({ id: row.id, staff: row.staff, since: row.clockInAt, until: row.shiftEnd, onBreak: row.onBreak?.kind ?? null, away: row.inLocation === "outside", lateMinutes: row.lateMinutes })),
      })),
    onClock: board.open.length,
    onBreak: board.byHome.flatMap(home => home.on).filter(row => row.onBreak).length,
    incidents: incidents.map(row => ({
      ...row,
      category: label("incidentCategory", row.category),
      severityLabel: label("incidentSeverity", row.severity),
      deadline: row.reportable && !row.filed ? deadline(row.occurredAt) : null,
      overdue: row.reportable && !row.filed && deadline(row.occurredAt).getTime() < now,
    })),
    reviewing: reviewing[0]?.n ?? 0,
    waiting: { timeOff: timeOff[0]?.n ?? 0, corrections: board.corrections.length, punches: board.review.length, timesheets: sheets.length },
  };
}

/* Everything waiting for a manager's decision, with what they need to decide it. */
export async function teamApprovals(now: number, settings: Settings) {
  const today = dateKey(new Date(now));
  const [board, timeOff, sheets] = await Promise.all([liveBoard(now, settings), timeOffBoard(today), signedTimesheets()]);
  return {
    timeOff: timeOff.pending.map(({ request, staff, balance, shifts }) => {
      const notice = daysBetween(dateKey(request.createdAt), request.startDate);
      return {
        id: request.id,
        staff,
        type: request.type,
        paid: request.paid,
        start: request.startDate,
        end: request.endDate,
        minutes: request.minutes,
        reason: request.reason,
        usesBalance: request.usesBalance,
        balance,
        shifts,
        shortNotice: notice < settings.time_off_notice_days && !/sick/i.test(request.type) ? Math.max(0, notice) : null,
        askedAt: request.createdAt,
      };
    }),
    corrections: board.corrections.map(({ correction, staff, home }) => ({ id: correction.id, staff, home, clockInAt: correction.clockInAt, clockOutAt: correction.clockOutAt, reason: correction.reason, newPunch: !correction.entryId, askedAt: correction.createdAt })),
    punches: board.review.map(row => ({ id: row.id, staff: row.staff, home: row.home, clockInAt: row.clockInAt, clockOutAt: row.clockOutAt, flags: row.flags.map(flagLabel), warnings: row.warnings })),
    timesheets: sheets.map(row => ({ ...row, totals: row.totals ?? null })),
  };
}

/* One incident for a manager: what happened, the reporting deadline, the timeline and the photos. */
export async function incidentForPhone(id: string) {
  const record = await incidentRecord(id);
  if (!record) return null;
  const { incident } = record;
  const photos = await photosFor(id);
  return {
    id: incident.id,
    status: incident.status,
    statusLabel: label("incidentStatus", incident.status),
    occurredAt: incident.occurredAt,
    category: label("incidentCategory", incident.category),
    severity: incident.severity,
    severityLabel: label("incidentSeverity", incident.severity),
    description: incident.description,
    actionsTaken: incident.actionsTaken,
    reportable: incident.reportable,
    stateFiledAt: incident.stateFiledAt,
    deadline: incident.reportable && !incident.stateFiledAt ? record.deadline : null,
    overdue: incident.reportable && !incident.stateFiledAt && record.deadline.getTime() < Date.now(),
    person: record.person ? `${record.person.firstName} ${record.person.lastName}` : null,
    home: record.home,
    reporter: record.reporter,
    timeline: record.timeline.map(entry => ({ id: entry.id, kind: entry.kind, body: entry.body, at: entry.at, by: entry.by })),
    photos: photos.map(photo => ({ id: photo.id, caption: photo.caption, by: photo.by, at: photo.createdAt })),
  };
}
