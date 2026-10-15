import "server-only";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { INTENT_KINDS, PAGES, hoursWords, matchPeople, parseRequest, type AssistantReply, type Intent, type PageKey } from "@/lib/assistant";
import { dateKey, fmt } from "@/lib/format";
import { searchHelp } from "@/lib/help";
import { canManage, type SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { notesOwed } from "@/server/queries/notes-owed";
import { leaveBalance, myTimeOff } from "@/server/queries/pay";
import { taskCounts } from "@/server/queries/tasks";
import { clockInContext, clockOutContext, liveBoard, openEntry, staffTime } from "@/server/queries/timeclock";
import { chooseRequest, modelLoaded, warmModel } from "@/server/scribe";
import type { Settings } from "@/server/settings";

/*
 * Ask Mohuddle on the server: works out what was asked, then answers from the person's own data with
 * the same permission rules as the pages. Clock-ins and breaks come back as cards to confirm; the
 * existing clock actions do the work, with every rule they already enforce.
 */

const NO_STAFF: AssistantReply = { say: "Your login is not linked to a staff record, so there is no time clock for you.", via: "rules" };

const SUGGESTIONS = ["clock me in", "start my meal break", "when is my next shift", "what's due", "how many hours this week", "how do I fix a punch"];

async function people() {
  return db
    .select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName })
    .from(schema.individuals)
    .where(eq(schema.individuals.active, true))
    .orderBy(asc(schema.individuals.firstName));
}

/* Which request: the rules, then the local model when switched on and running. */
async function understand(text: string, settings: Settings): Promise<{ intent: Intent; via: AssistantReply["via"] }> {
  const ruled = parseRequest(text);
  if (ruled.kind !== "unknown") return { intent: ruled, via: "rules" };
  if (settings.scribe_enabled === "on" && text.trim().length >= 6) {
    // Only when the model is already loaded: nobody waits minutes for it. Otherwise start loading it for next time.
    if (!(await modelLoaded(settings.scribe_model))) warmModel(settings.scribe_model);
    else {
      try {
        const raw = (await chooseRequest(text, settings.scribe_model, INTENT_KINDS, Object.keys(PAGES))) as { kind?: string; person?: string; page?: string; break?: string };
        const kind = raw.kind ?? "unknown";
        const intent: Intent | null =
          kind === "write_note" || kind === "incident" ? { kind, person: String(raw.person ?? "") }
          : kind === "open" && raw.page && raw.page in PAGES ? { kind: "open", page: raw.page as PageKey }
          : kind === "break_start" ? { kind: "break_start", break: raw.break === "meal" || raw.break === "rest" ? raw.break : null }
          : kind === "help" ? { kind: "help", query: text }
          : ["clock_in", "clock_out", "break_end", "next_shift", "whos_on", "my_hours", "whats_due", "leave", "greeting"].includes(kind) ? ({ kind } as Intent)
          : null;
        if (intent) return { intent, via: "model" };
      } catch {
        // The model is slow or not running: fall through to the help guide.
      }
    }
  }
  return { intent: { kind: "help", query: text }, via: "help" };
}

export async function answer(text: string, user: SessionUser, settings: Settings, now: number): Promise<AssistantReply> {
  const { intent, via } = await understand(text, settings);
  const reply = await respond(intent, user, settings, now);
  return { ...reply, via: reply.via === "none" ? "none" : via };
}

async function respond(intent: Intent, user: SessionUser, settings: Settings, now: number): Promise<AssistantReply> {
  const staffId = user.staffId;
  switch (intent.kind) {
    case "greeting":
      return { say: `Hello ${user.name.split(" ")[0]}. Ask me to clock you in, start a break, or what's due.`, via: "rules" };

    case "clock_in": {
      if (!staffId) return NO_STAFF;
      if (await openEntry(staffId)) return { say: "You are already clocked in.", links: [{ label: "My time clock", href: "/app/clock" }], via: "rules" };
      const context = await clockInContext(staffId, now, settings);
      if (!context.shift) {
        const next = context.upcoming ?? context.later;
        return {
          say: next ? `You have no shift to clock in to right now. Your next shift is ${next.pattern ?? "a shift"} at ${next.home}, ${fmt.weekday(dateKey(next.startsAt))} ${fmt.dateTime(next.startsAt)}.` : "You have no shift to clock in to right now.",
          detail: ["To work without a scheduled shift, use the clock-in page and say why."],
          links: [{ label: "Clock in without a shift", href: "/app/clock/in" }],
          via: "rules",
        };
      }
      const needs = settings.clock_in_requirements;
      const handovers = needs.includes("handover") ? context.handovers.filter(item => item.homeId === context.shift!.homeId) : [];
      return {
        say: `Clock in to ${context.shift.pattern ?? "your shift"} at ${context.shift.home}?`,
        confirm: {
          action: "clock_in",
          shiftId: context.shift.id,
          title: `${context.shift.pattern ?? "Shift"} at ${context.shift.home}`,
          detail: `${fmt.time(context.shift.startsAt)} to ${fmt.time(context.shift.endsAt)}`,
          statements: needs.includes("statements") ? settings.clock_in_statements : [],
          handovers: handovers.map(item => ({ id: item.id, from: item.staff ?? "The last shift", at: fmt.dateTime(item.createdAt), note: item.note })),
        },
        via: "rules",
      };
    }

    case "clock_out": {
      if (!staffId) return NO_STAFF;
      const open = await openEntry(staffId);
      if (!open) return { say: "You are not clocked in.", via: "rules" };
      const context = await clockOutContext(open, now, settings);
      const missing = context.people.filter(person => !person.noteWritten);
      const detail = [
        missing.length ? `Daily notes still to write: ${missing.map(person => person.first).join(", ")}.` : "All your daily notes are written.",
        context.dosesMissing ? `${context.dosesMissing} ${context.dosesMissing === 1 ? "dose is" : "doses are"} not recorded yet.` : "",
        "Then write the handover for the next shift, tick the checks and sign.",
      ].filter(Boolean);
      return {
        say: missing.length || context.dosesMissing ? "Before you clock out:" : "You are ready to clock out. Write the handover and sign.",
        detail,
        links: [...missing.slice(0, 4).map(person => ({ label: `Write ${person.first}'s note`, href: `/app/daily-logs/new?individual=${person.id}` })), ...(context.dosesMissing ? [{ label: "Medications", href: "/app/medications" }] : []), { label: "Clock out", href: "/app/clock/out" }],
        via: "rules",
      };
    }

    case "break_start": {
      if (!staffId) return NO_STAFF;
      const open = await openEntry(staffId);
      if (!open) return { say: "You need to be clocked in to take a break.", via: "rules" };
      if (open.openBreak) return { say: `You are already on a ${open.openBreak.kind} break since ${fmt.time(open.openBreak.startAt)}.`, confirm: { action: "break_end", title: "End your break?" }, via: "rules" };
      const options = [
        { kind: "meal" as const, label: `Meal break, ${settings.break_meal_minutes} min, unpaid` },
        { kind: "rest" as const, label: `Rest break, ${settings.break_rest_minutes} min, paid` },
      ].filter(option => !intent.break || option.kind === intent.break);
      return { say: intent.break ? `Start your ${intent.break} break now?` : "Which break?", confirm: { action: "break_start", options }, via: "rules" };
    }

    case "break_end": {
      if (!staffId) return NO_STAFF;
      const open = await openEntry(staffId);
      if (!open?.openBreak) return { say: "You are not on a break.", via: "rules" };
      return { say: `End your ${open.openBreak.kind} break? It started at ${fmt.time(open.openBreak.startAt)}.`, confirm: { action: "break_end", title: "End break" }, via: "rules" };
    }

    case "next_shift": {
      if (!staffId) return NO_STAFF;
      const open = await openEntry(staffId);
      const context = await clockInContext(staffId, now, settings);
      const lines: string[] = [];
      if (open) lines.push(`You are clocked in at ${open.home ?? "work"} since ${fmt.time(open.entry.clockInAt)}${open.shiftEnd ? `; your shift ends at ${fmt.time(open.shiftEnd)}` : ""}.`);
      const next = context.shift ?? context.upcoming ?? context.later;
      if (next) lines.push(`${context.shift ? "Your shift now" : "Your next shift"}: ${next.pattern ?? "shift"} at ${next.home}, ${fmt.weekday(dateKey(next.startsAt))} ${fmt.dateTime(next.startsAt)}.`);
      return { say: lines[0] ?? "You have no shifts on the schedule yet. Your manager adds them.", detail: lines.slice(1), links: [{ label: "My time clock", href: "/app/clock" }], via: "rules" };
    }

    case "whos_on": {
      const board = await liveBoard(now, settings);
      let homes = board.byHome;
      if (!canManage(user)) {
        const mine = staffId ? await openEntry(staffId) : null;
        homes = mine?.entry.homeId ? homes.filter(home => home.id === mine.entry.homeId) : [];
        if (!homes.length) return { say: "Clock in to see who is on at your home.", via: "rules" };
      }
      const lines = homes.filter(home => home.on.length).map(home => `${home.name}: ${home.on.map(row => `${row.staff}${row.onBreak ? " (on break)" : ""}`).join(", ")}`);
      return { say: lines.length ? "On the clock now:" : "Nobody is clocked in right now.", detail: lines, links: canManage(user) ? [{ label: "Live board", href: "/app/time" }] : [], via: "rules" };
    }

    case "my_hours": {
      if (!staffId) return NO_STAFF;
      const time = await staffTime(staffId, now);
      const overtimeIn = settings.overtime_after_hours * 60 - time.weekMinutes;
      return {
        say: `You have worked ${hoursWords(time.weekMinutes)} this week, since Monday.`,
        detail: [overtimeIn > 0 ? `Overtime starts after ${settings.overtime_after_hours} hours: ${hoursWords(overtimeIn)} from now.` : `That is over ${settings.overtime_after_hours} hours, so you are in overtime.`],
        links: [{ label: "My timesheets", href: "/app/clock/timesheets" }],
        via: "rules",
      };
    }

    case "leave": {
      if (!staffId) return NO_STAFF;
      const [balance, requests] = await Promise.all([leaveBalance(staffId), myTimeOff(staffId)]);
      const pending = requests.filter(request => request.status === "pending").length;
      return { say: balance > 0 ? `You have ${hoursWords(balance)} of leave.` : "You have no leave hours yet. They build up as you work, when your agency uses a balance.", detail: pending ? [`${pending} ${pending === 1 ? "request is" : "requests are"} waiting for your manager.`] : [], links: [{ label: "My time off", href: "/app/clock/time-off" }], via: "rules" };
    }

    case "whats_due": {
      const lines: string[] = [];
      const links: { label: string; href: string }[] = [];
      if (staffId) {
        const owed = await notesOwed({ from: new Date(now - 3 * 86_400_000), staffId });
        const notes = owed.flatMap(shift => shift.people.filter(person => !person.logId).map(person => ({ id: person.id, first: person.name.split(" ")[0], state: shift.state })));
        if (notes.length) {
          const overdue = notes.filter(note => note.state === "overdue").length;
          lines.push(`${notes.length} daily ${notes.length === 1 ? "note" : "notes"} to write${overdue ? `, ${overdue} overdue` : ""}: ${[...new Set(notes.map(note => note.first))].join(", ")}.`);
          links.push(...notes.slice(0, 3).map(note => ({ label: `Write ${note.first}'s note`, href: `/app/daily-logs/new?individual=${note.id}` })));
        }
        const open = await openEntry(staffId);
        if (open) {
          const context = await clockOutContext(open, now, settings);
          if (context.dosesMissing) {
            lines.push(`${context.dosesMissing} ${context.dosesMissing === 1 ? "dose is" : "doses are"} due and not recorded at ${open.home ?? "your home"}.`);
            links.push({ label: "Medications", href: "/app/medications" });
          }
        }
      }
      const tasks = await taskCounts(staffId);
      if (tasks.mine) {
        lines.push(`${tasks.mine} open ${tasks.mine === 1 ? "task" : "tasks"} assigned to you.`);
        links.push({ label: "Tasks", href: "/app/tasks" });
      }
      const sentBack = staffId
        ? (await db.select({ id: schema.dailyLogs.id }).from(schema.dailyLogs).where(and(eq(schema.dailyLogs.staffId, staffId), eq(schema.dailyLogs.reviewStatus, "returned")))).length +
          (await db.select({ id: schema.communityNotes.id }).from(schema.communityNotes).where(and(eq(schema.communityNotes.staffId, staffId), eq(schema.communityNotes.reviewStatus, "returned")))).length
        : 0;
      if (sentBack) {
        lines.push(`${sentBack} ${sentBack === 1 ? "note was" : "notes were"} sent back to you to fix.`);
        links.push({ label: "Sent back", href: "/app/daily-logs?view=review" });
      }
      const docs = staffId
        ? await db.select({ id: schema.documentRequests.id }).from(schema.documentRequests).where(and(eq(schema.documentRequests.staffId, staffId), isNull(schema.documentRequests.revokedAt), isNull(schema.documentRequests.completedAt), gte(schema.documentRequests.expiresAt, new Date(now))))
        : [];
      if (docs.length) {
        lines.push(`${docs.length} document ${docs.length === 1 ? "request" : "requests"} to finish.`);
        links.push({ label: "My documents", href: "/app/my-documents" });
      }
      return { say: lines.length ? "Here is what is waiting for you:" : "Nothing is waiting for you right now.", detail: lines, links, via: "rules" };
    }

    case "write_note":
    case "incident": {
      const list = await people();
      const found = intent.person ? matchPeople(list, intent.person) : [];
      const path = intent.kind === "write_note" ? "/app/daily-logs/new" : "/app/incidents/new";
      const what = intent.kind === "write_note" ? "daily note" : "incident report";
      const article = intent.kind === "write_note" ? "a" : "an";
      if (found.length === 1) return { say: `Opening ${article} ${what} for ${found[0].first} ${found[0].last}.`, links: [{ label: `${intent.kind === "write_note" ? "Write" : "Report for"} ${found[0].first}`, href: `${path}?individual=${found[0].id}` }], via: "rules" };
      if (found.length > 1) return { say: `Which ${found[0].first.length ? "person" : "one"}?`, links: found.slice(0, 5).map(person => ({ label: `${person.first} ${person.last}`, href: `${path}?individual=${person.id}` })), via: "rules" };
      return { say: intent.person ? `I could not find "${intent.person}". Choose the person on the form.` : `Choose the person on the form.`, links: [{ label: `New ${what}`, href: path }], via: "rules" };
    }

    case "open": {
      const page = PAGES[intent.page];
      if (intent.page === "settings" && !canManage(user)) return { say: "Settings are for coordinators and administrators.", via: "rules" };
      return { say: `Opening ${page.label}.`, links: [{ label: page.label, href: page.href }], via: "rules" };
    }

    case "help": {
      const found = searchHelp(intent.query);
      if (!found.length) {
        return { say: intent.query ? "I am not sure about that one. Here is what I can do:" : "Here is what I can do:", detail: SUGGESTIONS.map(item => `"${item}"`), via: "none" };
      }
      const [best, other] = found;
      return {
        say: best.title,
        detail: best.steps,
        links: [...(best.href ? [{ label: best.link ?? best.title, href: best.href }] : []), ...(other ? [{ label: `Also: ${other.title}`, href: other.href ?? "/app" }] : [])].filter(link => link.href),
        via: "help",
      };
    }

    default:
      return { say: "Here is what I can do:", detail: SUGGESTIONS.map(item => `"${item}"`), via: "none" };
  }
}

/* Words Whisper should listen for in a request: people, staff, homes, and the app's own words. */
export async function assistantVocabulary() {
  const [persons, staff, homes] = await Promise.all([
    people(),
    db.select({ first: schema.staff.firstName, last: schema.staff.lastName }).from(schema.staff).where(eq(schema.staff.active, true)),
    db.select({ name: schema.homes.name }).from(schema.homes).where(eq(schema.homes.active, true)),
  ]);
  return [...new Set(["Mohuddle", "clock in", "clock out", "break", "MAR", "timesheet", ...persons.flatMap(person => [person.first, person.last]), ...staff.map(row => row.first), ...homes.map(home => home.name)])];
}
