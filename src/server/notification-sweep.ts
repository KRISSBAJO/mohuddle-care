import "server-only";
import { and, count, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { dateKey, fmt } from "@/lib/format";
import { db, schema, systemDb } from "@/server/db";
import { homeManagerOf, notify, recipients, type Role } from "@/server/notify";
import { liveBoard } from "@/server/queries/timeclock";
import { unsignedSheets, workweekMinutes } from "@/server/queries/payroll";
import { notesOwed } from "@/server/queries/notes-owed";
import { sendMorningDigest } from "@/server/digest";
import { shiftReminders } from "@/server/shift-reminders";
import { getSettings } from "@/server/settings";
import { forEachAgency } from "@/server/agency";
import { healthLog, noteProblem, noteSweep } from "@/server/health-log";

const state = globalThis as unknown as { milestoneSweepAt?: number; milestoneSweepRunning?: boolean };
// Every minute, so a "starts in 15 minutes" reminder is never more than a minute late.
const EVERY_MS = 60_000;

/*
 * Sends the reminders that depend on time passing: upcoming appointments, visits not yet documented,
 * follow-ups not booked, overdue daily notes and incident filing deadlines. Every message has a
 * dedupe key, so running this often never sends the same reminder twice. It runs at most once a
 * minute, from the background tick in src/instrumentation.ts and after a page in the Hub is served.
 */
export async function sweepNotifications(force = false) {
  const now = Date.now();
  if (!force && (state.milestoneSweepRunning || now - (state.milestoneSweepAt ?? 0) < EVERY_MS)) return { skipped: true };
  state.milestoneSweepRunning = true;
  state.milestoneSweepAt = now;
  try {
    // Each agency in turn, with its own settings, people and data.
    const agencies = await systemDb.select({ n: count() }).from(schema.agencies).where(eq(schema.agencies.active, true));
    const sent = await forEachAgency("Notification sweep", () => sweepAgency(now));
    noteSweep({ startedAt: now, finishedAt: Date.now(), sent, agencies: agencies[0]?.n ?? 0, failures: healthLog().problems.filter(problem => problem.at >= now && problem.where.startsWith("Notification sweep")) });
    return { sent };
  } catch (error) {
    noteProblem("Notification sweep", error);
    throw error;
  } finally {
    state.milestoneSweepRunning = false;
  }
}

/* One agency's timed reminders. Runs as that agency, so every query sees only its rows. */
async function sweepAgency(now: number) {
  let sent = 0;
  const settings = await getSettings();
  const today = dateKey(new Date(now));
  const managers = new Map<string, string | null>();
  const managerOf = async (homeId: string | null) => {
    if (!homeId) return null;
    if (!managers.has(homeId)) managers.set(homeId, await homeManagerOf(homeId));
    return managers.get(homeId) ?? null;
  };

  // Appointments coming up, today, without an escort, or past and not documented.
  const appointments = await db
    .select({
      id: schema.appointments.id,
      type: schema.appointments.type,
      provider: schema.appointments.provider,
      clinic: schema.appointments.clinic,
      scheduledAt: schema.appointments.scheduledAt,
      escortStaffId: schema.appointments.escortStaffId,
      first: schema.individuals.firstName,
      last: schema.individuals.lastName,
      homeId: schema.individuals.homeId,
    })
    .from(schema.appointments)
    .innerJoin(schema.individuals, eq(schema.individuals.id, schema.appointments.individualId))
    .where(
      and(
        eq(schema.appointments.status, "scheduled"),
        gte(schema.appointments.scheduledAt, new Date(now - 30 * 86_400_000)),
        lt(schema.appointments.scheduledAt, new Date(now + Math.max(1, settings.appointment_reminder_days) * 86_400_000)),
      ),
    );
  for (const visit of appointments) {
    const href = `/app/appointments/${visit.id}`;
    const who = `${visit.first} ${visit.last}`;
    const what = `${visit.type}${visit.provider ? ` with ${visit.provider}` : ""}`;
    const at = visit.scheduledAt.getTime();
    const manager = await managerOf(visit.homeId);
    if (at > now) {
      const day = dateKey(visit.scheduledAt);
      const whenText = `${day === today ? "Today" : `${fmt.weekday(day)} ${fmt.day(day)}`} at ${fmt.time(visit.scheduledAt)}${visit.clinic ? `, ${visit.clinic}` : ""}`;
      sent += await notify(await recipients({ staffIds: [visit.escortStaffId, manager] }), {
        kind: "appointment:reminder",
        title: `${who}: ${what}`,
        body: `${whenText}.${visit.escortStaffId ? "" : " Nobody is booked to go with them yet."}`,
        href,
        tone: "info",
        dedupeKey: `appointment:reminder:${visit.id}:${at}`,
      });
      if (day === today && visit.escortStaffId) {
        sent += await notify(await recipients({ staffIds: [visit.escortStaffId] }), {
          kind: "appointment:today",
          title: `Today: ${who}'s ${visit.type.toLowerCase()} at ${fmt.time(visit.scheduledAt)}`,
          body: "Check the visit sheet before you leave, and document the visit afterwards.",
          href,
          tone: "info",
          dedupeKey: `appointment:today:${visit.id}:${at}`,
        });
      }
      if (!visit.escortStaffId) {
        sent += await notify(await recipients({ roles: settings.notify_roles_appointments, staffIds: [manager] }), {
          kind: "appointment:no-escort",
          title: `No one is going with ${who} yet`,
          body: `${what}, ${whenText}. Choose an escort.`,
          href,
          tone: "warn",
          dedupeKey: `appointment:no-escort:${visit.id}:${at}`,
        });
      }
    } else if (now - at > settings.appointment_document_hours * 3_600_000) {
      sent += await notify(await recipients({ roles: settings.notify_roles_appointments, staffIds: [visit.escortStaffId, manager] }), {
        kind: "appointment:undocumented",
        title: `${who}'s ${visit.type.toLowerCase()} visit is not documented`,
        body: `It was on ${fmt.dateTime(visit.scheduledAt)}. Write what happened, or mark it cancelled or missed.`,
        href,
        tone: "bad",
        dedupeKey: `appointment:undocumented:${visit.id}`,
      });
    }
  }

  // Follow-ups the doctor asked for that are past their date and still not booked.
  const followUps = await db
    .select({ id: schema.appointments.id, type: schema.appointments.type, followUpBy: schema.appointments.followUpBy, first: schema.individuals.firstName, homeId: schema.individuals.homeId })
    .from(schema.appointments)
    .innerJoin(schema.individuals, eq(schema.individuals.id, schema.appointments.individualId))
    .where(and(eq(schema.appointments.status, "completed"), eq(schema.appointments.followUpNeeded, true), isNull(schema.appointments.nextAppointmentId), lt(schema.appointments.followUpBy, today)));
  for (const visit of followUps) {
    sent += await notify(await recipients({ roles: settings.notify_roles_appointments, staffIds: [await managerOf(visit.homeId)] }), {
      kind: "appointment:follow-up-overdue",
      title: `${visit.first}'s ${visit.type.toLowerCase()} follow-up is overdue`,
      body: `It was needed by ${fmt.day(visit.followUpBy)} and is not booked.`,
      href: `/app/appointments/${visit.id}`,
      tone: "bad",
      dedupeKey: `appointment:follow-up-overdue:${visit.id}`,
    });
  }

  // Daily notes past their deadline: the staff member who owes them, their home manager and the chosen roles.
  const owed = await notesOwed({ from: new Date(now - 3 * 86_400_000) });
  for (const shift of owed) {
    const missing = shift.people.filter(person => !person.logId);
    if (shift.state !== "overdue" || !missing.length) continue;
    const names = missing.map(person => person.name.split(" ")[0]).join(", ");
    sent += await notify(await recipients({ staffIds: [shift.staffId] }), {
      kind: "notes:overdue",
      title: `You owe ${missing.length} daily ${missing.length === 1 ? "note" : "notes"} from ${fmt.weekday(shift.day)} ${fmt.day(shift.day)}`,
      body: `${shift.home}, ${shift.pattern}: ${names}.`,
      href: "/app/daily-logs?view=owed",
      tone: "bad",
      dedupeKey: `notes:overdue:${shift.shiftId}`,
    });
    const overseers = await recipients({ roles: settings.notify_roles_notes, staffIds: [await managerOf(shift.homeId)] });
    sent += await notify(
      overseers.filter(Boolean),
      {
        kind: "notes:overdue-team",
        title: `${shift.staff}: ${missing.length} overdue ${missing.length === 1 ? "note" : "notes"} from ${fmt.weekday(shift.day)} ${fmt.day(shift.day)}`,
        body: `${shift.home}, ${shift.pattern} on ${fmt.weekday(shift.day)} ${fmt.day(shift.day)}: ${names}.`,
        href: `/app/daily-logs?view=owed&day=${shift.day}`,
        tone: "warn",
        dedupeKey: `notes:overdue-team:${shift.shiftId}`,
      },
    );
  }

  // Reportable incidents close to, or past, their state filing deadline.
  const hours = settings.incident_report_hours;
  const incidents = await db
    .select({ id: schema.incidents.id, occurredAt: schema.incidents.occurredAt, category: schema.incidents.category, homeId: schema.incidents.homeId, first: schema.individuals.firstName })
    .from(schema.incidents)
    .leftJoin(schema.individuals, eq(schema.individuals.id, schema.incidents.individualId))
    .where(and(eq(schema.incidents.reportable, true), isNull(schema.incidents.stateFiledAt), ne(schema.incidents.status, "closed"), gte(schema.incidents.occurredAt, new Date(now - 14 * 86_400_000))));
  for (const incident of incidents) {
    const deadline = incident.occurredAt.getTime() + hours * 3_600_000;
    const overdue = deadline < now;
    if (!overdue && deadline - now > 6 * 3_600_000) continue;
    sent += await notify(await recipients({ roles: settings.notify_roles_incidents, staffIds: [await managerOf(incident.homeId)] }), {
      kind: overdue ? "incident:filing-overdue" : "incident:filing-soon",
      title: overdue ? `State filing overdue${incident.first ? ` for ${incident.first}` : ""}` : `State filing due by ${fmt.time(new Date(deadline))}`,
      body: `A reportable ${incident.category.replace("_", " ")} incident from ${fmt.dateTime(incident.occurredAt)} has not been filed.`,
      href: `/app/incidents/${incident.id}`,
      tone: overdue ? "bad" : "warn",
      dedupeKey: `incident:${overdue ? "filing-overdue" : "filing-soon"}:${incident.id}`,
    });
  }
  // Tier 1 events not yet reported to DIDD Investigations, close to or past their deadline.
  const tier1 = await db
    .select({ id: schema.incidents.id, occurredAt: schema.incidents.occurredAt, discoveredAt: schema.incidents.discoveredAt, homeId: schema.incidents.homeId, notifications: schema.incidents.notifications, first: schema.individuals.firstName })
    .from(schema.incidents)
    .leftJoin(schema.individuals, eq(schema.individuals.id, schema.incidents.individualId))
    .where(and(eq(schema.incidents.tier, "tier1"), ne(schema.incidents.status, "closed"), gte(schema.incidents.occurredAt, new Date(now - 3 * 86_400_000))));
  for (const incident of tier1) {
    if (incident.notifications.some(item => /investigat|didd/i.test(item.party))) continue;
    const deadline = (incident.discoveredAt ?? incident.occurredAt).getTime() + settings.incident_tier1_hours * 3_600_000;
    const overdue = deadline < now;
    sent += await notify(await recipients({ roles: settings.notify_roles_incidents, staffIds: [await managerOf(incident.homeId)] }), {
      kind: overdue ? "incident:tier1-overdue" : "incident:tier1-due",
      title: overdue ? `Tier 1 event${incident.first ? ` for ${incident.first}` : ""} not yet reported to DIDD Investigations` : `Tier 1 event: report to DIDD Investigations by ${fmt.time(new Date(deadline))}`,
      body: "Call DIDD Investigations, then record it in the incident's notifications.",
      href: `/app/incidents/${incident.id}`,
      tone: "bad",
      dedupeKey: `incident:${overdue ? "tier1-overdue" : "tier1-due"}:${incident.id}`,
    });
  }

  // Documents near or past their expiry date: the staff member it belongs to and the document reviewers.
  const docs = await db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      expiresOn: schema.documents.expiresOn,
      ownerKind: schema.documents.ownerKind,
      staffId: schema.documents.staffId,
      individualId: schema.documents.individualId,
      homeId: schema.documents.homeId,
      reminderDays: schema.documentTypes.reminderDays,
      staffFirst: schema.staff.firstName,
      staffLast: schema.staff.lastName,
      personFirst: schema.individuals.firstName,
      homeName: schema.homes.name,
    })
    .from(schema.documents)
    .leftJoin(schema.documentTypes, eq(schema.documentTypes.id, schema.documents.typeId))
    .leftJoin(schema.staff, eq(schema.staff.id, schema.documents.staffId))
    .leftJoin(schema.individuals, eq(schema.individuals.id, schema.documents.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.documents.homeId))
    .where(and(eq(schema.documents.status, "approved"), sql`${schema.documents.expiresOn} is not null`, lt(schema.documents.expiresOn, dateKey(new Date(now + 120 * 86_400_000)))));
  for (const doc of docs) {
    const daysLeft = Math.round((Date.parse(`${doc.expiresOn}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
    const expired = daysLeft < 0;
    if (!expired && daysLeft > (doc.reminderDays ?? 30)) continue;
    const whose = doc.staffFirst ? `${doc.staffFirst} ${doc.staffLast}` : doc.personFirst ? doc.personFirst : (doc.homeName ?? "The agency");
    const reviewers = await recipients({ roles: settings.notify_roles_documents });
    sent += await notify(reviewers, {
      kind: expired ? "document:expired" : "document:expiring",
      title: `${whose}: ${doc.title} ${expired ? "has expired" : `expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`}`,
      body: `${expired ? "Expired" : "Expires"} ${fmt.day(doc.expiresOn)}. ${doc.ownerKind === "staff" ? "Request a renewal from their staff file." : "Upload the renewed document."}`,
      href: `/app/documents/${doc.id}`,
      tone: expired ? "bad" : "warn",
      dedupeKey: `document:${expired ? "expired" : "expiring"}:${doc.id}`,
    });
    if (doc.staffId) {
      sent += await notify(await recipients({ staffIds: [doc.staffId] }), {
        kind: expired ? "document:expired" : "document:expiring",
        title: `Your ${doc.title} ${expired ? "has expired" : `expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`}`,
        body: "Renew it and send the new one to the office.",
        href: "/app/my-documents",
        tone: expired ? "bad" : "warn",
        dedupeKey: `document:${expired ? "expired" : "expiring"}:${doc.id}:staff`,
      });
    }
  }

  // Insurance cover ending within 30 days, or already ended and still marked active.
  const cover = await db
    .select({ id: schema.personInsurance.id, kind: schema.personInsurance.kind, payer: schema.personInsurance.payer, effectiveTo: schema.personInsurance.effectiveTo, individualId: schema.personInsurance.individualId, first: schema.individuals.firstName, last: schema.individuals.lastName, homeId: schema.individuals.homeId })
    .from(schema.personInsurance)
    .innerJoin(schema.individuals, eq(schema.individuals.id, schema.personInsurance.individualId))
    .where(and(eq(schema.personInsurance.active, true), eq(schema.individuals.active, true), lt(schema.personInsurance.effectiveTo, dateKey(new Date(now + 30 * 86_400_000)))));
  for (const row of cover) {
    const ended = row.effectiveTo! < today;
    sent += await notify(await recipients({ roles: settings.notify_roles_documents, staffIds: [await managerOf(row.homeId)] }), {
      kind: ended ? "insurance:ended" : "insurance:renewal",
      title: `${row.first} ${row.last}: ${row.kind} ${ended ? "cover has ended" : "renews soon"}`,
      body: `${row.payer}, ${ended ? "ended" : "ends"} ${fmt.day(row.effectiveTo)}. Check eligibility and update the record.`,
      href: `/app/individuals/${row.individualId}?tab=care-team`,
      tone: ended ? "bad" : "warn",
      dedupeKey: `insurance:${ended ? "ended" : "renewal"}:${row.id}:${row.effectiveTo}`,
    });
  }

  // Tasks that have just gone past their due time: the person doing them is told once.
  const lateTasks = await db
    .select({ id: schema.tasks.id, title: schema.tasks.title, dueAt: schema.tasks.dueAt, assignedTo: schema.tasks.assignedTo })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.status, "open"), sql`${schema.tasks.assignedTo} is not null`, lt(schema.tasks.dueAt, new Date(now)), gte(schema.tasks.dueAt, new Date(now - 7 * 86_400_000))));
  for (const task of lateTasks) {
    sent += await notify(await recipients({ staffIds: [task.assignedTo] }), {
      kind: "task:overdue",
      title: `Overdue: ${task.title}`,
      body: `It was due ${fmt.dateTime(task.dueAt!)}. Finish it, or change the date with a comment on why.`,
      href: `/app/tasks/${task.id}`,
      tone: "bad",
      dedupeKey: `task:overdue:${task.id}:${task.dueAt!.getTime()}`,
    });
  }

  // Requests past their due date with items still to send.
  const overdueRequests = await db
    .select({ id: schema.documentRequests.id, staffId: schema.documentRequests.staffId, title: schema.documentRequests.title, dueOn: schema.documentRequests.dueOn })
    .from(schema.documentRequests)
    .where(and(isNull(schema.documentRequests.revokedAt), isNull(schema.documentRequests.completedAt), lt(schema.documentRequests.dueOn, today)));
  for (const request of overdueRequests) {
    if (!request.staffId) continue;
    sent += await notify(await recipients({ staffIds: [request.staffId] }), {
      kind: "document:request-overdue",
      title: `${request.title}: some documents are overdue`,
      body: `They were needed by ${fmt.day(request.dueOn)}.`,
      href: "/app/my-documents",
      tone: "bad",
      dedupeKey: `document:request-overdue:${request.id}`,
    });
  }

  // Staff's own shift and break reminders, and the managers' morning summary.
  sent += await shiftReminders(now, settings);
  sent += await sendMorningDigest(now, settings);

  // Time clock: shifts with nobody clocked in, and people still clocked in long after their shift.
  const board = await liveBoard(now, settings);
  const timeRoles = settings.notify_roles_time as Role[];
  for (const shift of board.noShows.filter(item => item.endsAt.getTime() > now)) {
    sent += await notify(await recipients({ roles: timeRoles, staffIds: [await managerOf(shift.homeId)] }), {
      kind: "time:no-show",
      title: `No-show: ${shift.staff} has not clocked in at ${shift.home}`,
      body: `${shift.pattern ?? "Their shift"} started ${fmt.time(shift.startsAt)}. Call them, or find cover.`,
      href: "/app/time",
      tone: "bad",
      dedupeKey: `time:no-show:${shift.id}`,
    });
    sent += await notify(await recipients({ staffIds: [shift.staffId] }), {
      kind: "time:no-show",
      title: "You have not clocked in",
      body: `${shift.pattern ?? "Your shift"} at ${shift.home} started ${fmt.time(shift.startsAt)}. Clock in now, or call your manager.`,
      href: "/app/clock/in",
      tone: "bad",
      dedupeKey: `time:no-show-self:${shift.id}`,
    });
  }
  for (const row of board.forgotten) {
    sent += await notify(await recipients({ staffIds: [row.staffId] }), {
      kind: "time:forgot",
      title: "You are still clocked in",
      body: `Since ${fmt.dateTime(row.clockInAt)} at ${row.home ?? "work"}. Clock out now, or ask for a correction if you already left.`,
      href: "/app/clock",
      tone: "bad",
      dedupeKey: `time:forgot-self:${row.id}`,
    });
    sent += await notify(await recipients({ roles: timeRoles, staffIds: [await managerOf(row.homeId)] }), {
      kind: "time:forgot",
      title: `${row.staff} may have forgotten to clock out`,
      body: `Clocked in ${fmt.dateTime(row.clockInAt)} at ${row.home ?? "no home"}${row.shiftEnd ? `; the shift ended ${fmt.time(row.shiftEnd)}` : ""}. Close it with the right time.`,
      href: `/app/time/${row.id}`,
      tone: "warn",
      dedupeKey: `time:forgot:${row.id}`,
    });
  }

  // Pay: timesheets ready to sign, a finished period waiting to be locked, and overtime getting close.
  const unsigned = await unsignedSheets(settings, today);
  const range = `${fmt.day(unsigned.period.start)} to ${fmt.day(unsigned.period.end)}`;
  for (const staffId of unsigned.staffIds) {
    sent += await notify(await recipients({ staffIds: [staffId] }), {
      kind: "timesheet:sign",
      title: "Your timesheet is ready to sign",
      body: `Check your hours for ${range} and sign them for payroll.`,
      href: `/app/clock/timesheets/${unsigned.period.start}`,
      tone: "info",
      dedupeKey: `timesheet:sign:${unsigned.period.start}:${staffId}`,
    });
  }
  if (unsigned.hasTime && unsigned.period.end < today) {
    sent += await notify(await recipients({ roles: timeRoles }), {
      kind: "timesheet:period",
      title: `Pay period ${range} has ended`,
      body: "Approve the timesheets, lock the period, then download the payroll file.",
      href: `/app/time?tab=timesheets&period=${unsigned.period.start}`,
      tone: "info",
      dedupeKey: `timesheet:period:${unsigned.period.start}`,
    });
  }
  const weekHours = await workweekMinutes(settings, today);
  for (const row of weekHours.filter(item => item.minutes >= settings.overtime_warning_hours * 60)) {
    const worked = Math.floor(row.minutes / 60);
    sent += await notify(await recipients({ roles: timeRoles, staffIds: [row.staffId] }), {
      kind: "time:overtime",
      title: worked >= settings.overtime_after_hours ? `Overtime: ${worked} hours worked this week` : `Close to overtime: ${worked} hours worked this week`,
      body: `Overtime starts after ${settings.overtime_after_hours} hours in the workweek that began ${fmt.day(row.start)}.`,
      href: `/app/staff/${row.staffId}?tab=time`,
      tone: "warn",
      dedupeKey: `time:overtime:${row.staffId}:${row.start}:${worked >= settings.overtime_after_hours ? "over" : "near"}`,
    });
  }
  return sent;
}

/* Unread count and the latest few, for the bell. */
export async function bellFor(userId: string) {
  const [[{ unread }], latest] = await Promise.all([
    db.select({ unread: sql<number>`count(*)::int` }).from(schema.notifications).where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt))),
    db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)).orderBy(sql`${schema.notifications.readAt} is not null`, sql`${schema.notifications.createdAt} desc`).limit(8),
  ]);
  return { unread, latest };
}
