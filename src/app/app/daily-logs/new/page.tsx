import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { DailyLogForm, type LogPerson, type MyShift } from "@/components/logs/DailyLogForm";
import { PageHeader } from "@/components/app/ui";
import { dateKey } from "@/lib/format";
import { clockOf } from "@/lib/schedule";
import { activePatterns } from "@/server/queries/patterns";
import { configAbove, configsForPeople } from "@/server/queries/note-requirements";
import { requestTime } from "@/server/clock";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/guard";
import { getSettings } from "@/server/settings";

export const metadata = { title: "New daily log" };

type Shift = "day" | "evening" | "overnight";

export default async function NewDailyLogPage({ searchParams }: { searchParams: Promise<{ individual?: string; shift?: string }> }) {
  const user = await requireUser();
  const { individual, shift: shiftParam } = await searchParams;
  const today = dateKey();
  const [settings, now, patterns, people] = await Promise.all([
    getSettings(),
    requestTime(),
    activePatterns(),
    db
      .select({ id: schema.individuals.id, firstName: schema.individuals.firstName, lastName: schema.individuals.lastName, allergies: schema.individuals.allergies, supportNotes: schema.individuals.supportNotes, home: schema.homes.name, homeId: schema.individuals.homeId })
      .from(schema.individuals)
      .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
      .where(eq(schema.individuals.active, true))
      .orderBy(asc(schema.individuals.firstName), asc(schema.individuals.lastName)),
  ]);
  const ids = people.map(person => person.id);
  const [goals, todays] = ids.length
    ? await Promise.all([
        db
          .select({ id: schema.planGoals.id, individualId: schema.planGoals.individualId, title: schema.planGoals.title, description: schema.planGoals.description })
          .from(schema.planGoals)
          .where(and(inArray(schema.planGoals.individualId, ids), eq(schema.planGoals.status, "active")))
          .orderBy(asc(schema.planGoals.createdAt)),
        // This writer's own notes from the last two days, so the form can warn before a duplicate.
        user.staffId
          ? db
              .select({ individualId: schema.dailyLogs.individualId, shiftId: schema.dailyLogs.shiftId, logDate: schema.dailyLogs.logDate, shift: schema.dailyLogs.shift })
              .from(schema.dailyLogs)
              .where(and(eq(schema.dailyLogs.staffId, user.staffId), gte(schema.dailyLogs.logDate, dateKey(new Date(now - 2 * 86_400_000)))))
          : [],
      ])
    : [[], []];

  // The writer's shifts that started in the last 36 hours or start within the next 2: the ones a note can be for.
  const shiftRows = user.staffId
    ? await db
        .select({ id: schema.shifts.id, homeId: schema.shifts.homeId, home: schema.homes.name, kind: schema.shifts.kind, startsAt: schema.shifts.startsAt, endsAt: schema.shifts.endsAt, pattern: schema.shiftPatterns.name })
        .from(schema.shifts)
        .innerJoin(schema.homes, eq(schema.homes.id, schema.shifts.homeId))
        .leftJoin(schema.shiftPatterns, eq(schema.shiftPatterns.id, schema.shifts.patternId))
        .where(and(eq(schema.shifts.staffId, user.staffId), ne(schema.shifts.status, "missed"), gte(schema.shifts.startsAt, new Date(now - 36 * 3_600_000)), lt(schema.shifts.startsAt, new Date(now + 2 * 3_600_000))))
        .orderBy(desc(schema.shifts.startsAt))
    : [];
  const myShifts: MyShift[] = shiftRows.map(row => ({
    id: row.id,
    homeId: row.homeId,
    home: row.home,
    kind: row.kind,
    name: row.pattern ?? "Custom shift",
    day: dateKey(row.startsAt),
    start: clockOf(row.startsAt.toISOString()),
    end: clockOf(row.endsAt.toISOString()),
    current: row.startsAt.getTime() <= now && row.endsAt.getTime() > now,
  }));

  const options: LogPerson[] = people.map(person => ({
    id: person.id,
    name: `${person.firstName} ${person.lastName}`,
    home: person.home,
    allergies: person.allergies,
    supportNotes: person.supportNotes,
    goals: goals.filter(goal => goal.individualId === person.id).map(({ id, title, description }) => ({ id, title, description })),
    homeId: person.homeId,
    myRecentLogs: todays.filter(row => row.individualId === person.id).map(row => ({ shiftId: row.shiftId, logDate: row.logDate, shift: row.shift as Shift | null })),
  }));
  const [configs, defaultConfig] = await Promise.all([configsForPeople(people.map(person => ({ id: person.id, homeId: person.homeId }))), configAbove(null)]);
  const initialPerson = options.some(person => person.id === individual) ? (individual as string) : "";
  // Start on the shift asked for, else the writer's shift at this person's home, else their current or latest shift.
  const personHome = options.find(person => person.id === initialPerson)?.homeId;
  const initialShift =
    myShifts.find(shift => shift.id === shiftParam)?.id ??
    myShifts.find(shift => personHome && shift.homeId === personHome)?.id ??
    myShifts.find(shift => shift.current)?.id ??
    myShifts[0]?.id ??
    "";

  return (
    <div className="max-w-6xl">
      <Link href={initialPerson ? `/app/individuals/${initialPerson}?tab=logs` : "/app/daily-logs"} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> {initialPerson ? "Back to their logs" : "All daily logs"}
      </Link>
      <PageHeader
        eyebrow="Daily logs"
        title="Write a shift note"
        description={`Everyone who works a shift writes a note for each person they supported, within ${settings.shift_note_grace_hours} hours of the shift ending. It covers personal care, meals, sleep, health, plan goals, activities and behaviour, and you sign it when you save.`}
      />
      <div className="mt-6">
        <DailyLogForm
          people={options}
          initialPerson={initialPerson}
          initialShift={initialShift}
          myShifts={myShifts}
          patterns={patterns}
          today={today}
          locations={settings.log_locations}
          adlItems={settings.adl_items}
          promptLevels={settings.prompt_levels}
          activityTypes={settings.activity_types}
          requiredChecks={settings.required_daily_checks}
          summaryMin={settings.daily_log_summary_min_chars}
          signer={user.name}
          configs={configs}
          defaultConfig={defaultConfig}
        />
      </div>
    </div>
  );
}
