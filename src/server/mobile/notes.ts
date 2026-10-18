import "server-only";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { dateKey } from "@/lib/format";
import { earliestStart, goalProgress } from "@/lib/goal-progress";
import { ADL_EXTRA, dosesByHour, GOAL_OFFERED, GOAL_OUTCOME, INTAKE, MEALS, MOODS, shiftHours, SLEEP_QUALITY, STOOL_TYPES } from "@/lib/log-note";
import { OPTIONAL_SECTIONS, SECTION_KEYS } from "@/lib/note-requirements";
import { clockOf } from "@/lib/schedule";
import type { SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { shiftDoses } from "@/server/queries/logs";
import { notesOwed } from "@/server/queries/notes-owed";
import { configForPerson } from "@/server/queries/note-requirements";
import { phoneScribeReady } from "@/server/scribe";
import { getSettings } from "@/server/settings";

/* The phone app's Notes tab: the staff member's recent shifts, and who still needs a note. */
export async function notesToWrite(user: SessionUser, now: number) {
  if (!user.staffId) return { shifts: [] };
  const owed = await notesOwed({ from: new Date(now - 36 * 3_600_000), staffId: user.staffId });
  return {
    shifts: owed
      .filter(shift => shift.startsAt.getTime() <= now + 2 * 3_600_000)
      .reverse()
      .map(shift => ({ shiftId: shift.shiftId, home: shift.home, pattern: shift.pattern, startsAt: shift.startsAt, endsAt: shift.endsAt, state: shift.state, dueBy: shift.dueBy, people: shift.people })),
  };
}

/*
 * Everything the phone app needs to draw one shift note for one person: the sections and questions
 * this person's note asks, their plan goals, the hours of the shift with the doses due in each, and
 * the agency's lists. The answers go back to POST /api/v1/notes with the website's field names.
 */
export async function noteForm(user: SessionUser, individualId: string, shiftId: string | null, now: number) {
  const [person] = await db
    .select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName, homeId: schema.individuals.homeId, active: schema.individuals.active, allergies: schema.individuals.allergies, supportNotes: schema.individuals.supportNotes })
    .from(schema.individuals)
    .where(eq(schema.individuals.id, individualId))
    .limit(1);
  if (!person || !person.active) return { error: "That person is not on record any more." };

  // The shift must be the writer's own, as when saving.
  const [shift] =
    shiftId && user.staffId
      ? await db
          .select({ id: schema.shifts.id, kind: schema.shifts.kind, startsAt: schema.shifts.startsAt, endsAt: schema.shifts.endsAt, staffId: schema.shifts.staffId, pattern: schema.shiftPatterns.name, home: schema.homes.name })
          .from(schema.shifts)
          .innerJoin(schema.homes, eq(schema.homes.id, schema.shifts.homeId))
          .leftJoin(schema.shiftPatterns, eq(schema.shiftPatterns.id, schema.shifts.patternId))
          .where(eq(schema.shifts.id, shiftId))
          .limit(1)
      : [];
  if (shiftId && (!shift || shift.staffId !== user.staffId)) return { error: "You can only write notes for your own shifts." };

  const [settings, config, goals] = await Promise.all([
    getSettings(),
    configForPerson({ id: person.id, homeId: person.homeId }),
    db
      .select({ id: schema.planGoals.id, title: schema.planGoals.title, description: schema.planGoals.description, measurableStep: schema.planGoals.measurableStep, setupNotes: schema.planGoals.setupNotes, frequencyCount: schema.planGoals.frequencyCount, frequencyPeriod: schema.planGoals.frequencyPeriod })
      .from(schema.planGoals)
      .where(and(eq(schema.planGoals.individualId, person.id), eq(schema.planGoals.status, "active")))
      .orderBy(asc(schema.planGoals.createdAt)),
  ]);
  const today = dateKey(new Date(now));
  const since = earliestStart(goals.map(goal => goal.frequencyPeriod), today);
  const worked = goals.length
    ? await db
        .selectDistinct({ goalId: schema.dailyLogGoals.goalId, day: schema.dailyLogs.logDate })
        .from(schema.dailyLogGoals)
        .innerJoin(schema.dailyLogs, eq(schema.dailyLogs.id, schema.dailyLogGoals.logId))
        .where(and(inArray(schema.dailyLogGoals.goalId, goals.map(goal => goal.id)), eq(schema.dailyLogGoals.offered, "yes"), gte(schema.dailyLogs.logDate, since)))
    : [];

  const timeIn = shift ? clockOf(shift.startsAt.toISOString()) : "";
  const timeOut = shift ? clockOf(shift.endsAt.toISOString()) : "";
  const logDate = shift ? dateKey(shift.startsAt) : today;
  // The hours of the shift with the doses due in each, for the hourly timeline.
  const doses = shift ? await shiftDoses([person.id], shift.startsAt, shift.endsAt) : [];
  const byHour = shift ? dosesByHour(doses, logDate, timeIn, timeOut) : {};

  return {
    person: { id: person.id, name: `${person.first} ${person.last}`, first: person.first, allergies: person.allergies, supportNotes: person.supportNotes },
    shift: shift ? { id: shift.id, kind: shift.kind, name: shift.pattern ?? "Custom shift", home: shift.home, startsAt: shift.startsAt, endsAt: shift.endsAt } : null,
    defaults: { logDate, shift: shift?.kind ?? "day", timeIn, timeOut },
    sections: SECTION_KEYS.map(key => ({ key, title: OPTIONAL_SECTIONS[key].title, hint: OPTIONAL_SECTIONS[key].hint, on: config.sections[key].on, required: config.sections[key].required })),
    items: config.items.map(item => ({ id: item.id, label: item.label, fieldType: item.fieldType, options: item.options, unit: item.unit, help: item.help, required: item.required, followUpOn: item.followUpOn ?? "", followUpPrompt: item.followUpPrompt ?? "", followUpDocs: item.followUpDocs ?? [] })),
    goals: goals.map(goal => ({
      id: goal.id,
      title: goal.title,
      description: goal.description,
      measurableStep: goal.measurableStep,
      setupNotes: goal.setupNotes,
      progress: goalProgress(worked.filter(row => row.goalId === goal.id).map(row => row.day), goal.frequencyCount, goal.frequencyPeriod, today).label,
    })),
    timeline: shift ? shiftHours(timeIn, timeOut).map(hour => ({ hour, meds: byHour[hour] ?? [] })) : [],
    lists: {
      requiredChecks: settings.required_daily_checks,
      locations: settings.log_locations,
      adlItems: settings.adl_items,
      promptLevels: settings.prompt_levels,
      adlExtra: [...ADL_EXTRA],
      activityTypes: settings.activity_types,
      moods: [...MOODS],
      meals: [...MEALS],
      intake: [...INTAKE],
      sleepQuality: [...SLEEP_QUALITY],
      stoolTypes: [...STOOL_TYPES],
      goalOffered: GOAL_OFFERED,
      goalOutcome: GOAL_OUTCOME,
    },
    summaryMin: settings.daily_log_summary_min_chars,
    scribe: settings.scribe_enabled === "on" && await phoneScribeReady(settings.scribe_speech, settings.scribe_model),
  };
}
