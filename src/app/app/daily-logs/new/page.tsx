import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { DailyLogForm, type LogPerson } from "@/components/logs/DailyLogForm";
import { PageHeader } from "@/components/app/ui";
import { dateKey } from "@/lib/format";
import { requestTime } from "@/server/clock";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/guard";
import { getSettings } from "@/server/settings";

export const metadata = { title: "New daily log" };

type Shift = "day" | "evening" | "overnight";

/* The shift whose hours include this moment, from the shift hours in Settings. */
function currentShift(now: number, hours: Record<Shift, string>): Shift {
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  for (const shift of ["day", "evening", "overnight"] as const) {
    const [start, end] = hours[shift].split("-");
    const inside = start < end ? clock >= start && clock < end : clock >= start || clock < end;
    if (inside) return shift;
  }
  return "day";
}

export default async function NewDailyLogPage({ searchParams }: { searchParams: Promise<{ individual?: string }> }) {
  const user = await requireUser();
  const { individual } = await searchParams;
  const today = dateKey();
  const [settings, now, people] = await Promise.all([
    getSettings(),
    requestTime(),
    db
      .select({ id: schema.individuals.id, firstName: schema.individuals.firstName, lastName: schema.individuals.lastName, allergies: schema.individuals.allergies, supportNotes: schema.individuals.supportNotes, home: schema.homes.name })
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
        db.select({ individualId: schema.dailyLogs.individualId, shift: schema.dailyLogs.shift }).from(schema.dailyLogs).where(and(inArray(schema.dailyLogs.individualId, ids), eq(schema.dailyLogs.logDate, today))),
      ])
    : [[], []];

  const options: LogPerson[] = people.map(person => ({
    id: person.id,
    name: `${person.firstName} ${person.lastName}`,
    home: person.home,
    allergies: person.allergies,
    supportNotes: person.supportNotes,
    goals: goals.filter(goal => goal.individualId === person.id).map(({ id, title, description }) => ({ id, title, description })),
    loggedToday: todays.filter(row => row.individualId === person.id && row.shift).map(row => row.shift as Shift),
  }));
  const shiftHours = { day: settings.shift_day_hours, evening: settings.shift_evening_hours, overnight: settings.shift_overnight_hours };
  const initialPerson = options.some(person => person.id === individual) ? (individual as string) : "";

  return (
    <div className="max-w-6xl">
      <Link href={initialPerson ? `/app/individuals/${initialPerson}?tab=logs` : "/app/daily-logs"} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> {initialPerson ? "Back to their logs" : "All daily logs"}
      </Link>
      <PageHeader
        eyebrow="Daily logs"
        title="Write a shift note"
        description={`One note per person per shift, due by ${settings.daily_log_due_hour}:00. It covers personal care, meals, sleep, health, plan goals, activities and behaviour, and you sign it when you save.`}
      />
      <div className="mt-6">
        <DailyLogForm
          people={options}
          initialPerson={initialPerson}
          today={today}
          defaultShift={currentShift(now, shiftHours)}
          shiftHours={shiftHours}
          locations={settings.log_locations}
          adlItems={settings.adl_items}
          promptLevels={settings.prompt_levels}
          activityTypes={settings.activity_types}
          requiredChecks={settings.required_daily_checks}
          summaryMin={settings.daily_log_summary_min_chars}
          signer={user.name}
        />
      </div>
    </div>
  );
}
