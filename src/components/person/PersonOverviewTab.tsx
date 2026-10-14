import Link from "next/link";
import { ClipboardList, Phone, Pill, ShieldAlert, Stethoscope } from "lucide-react";
import { Avatar, Badge, Empty, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { fmt, initials, label } from "@/lib/format";
import { requestTime } from "@/server/clock";
import type { schema } from "@/server/db";
import { personOverview } from "@/server/queries/person";
import { nextAppointmentFor } from "@/server/queries/appointments";
import { DoseList, MoodStrip, MoreLink } from "./parts";

type Person = typeof schema.individuals.$inferSelect;
type Home = typeof schema.homes.$inferSelect;

const activityIcon = { log: ClipboardList, incident: ShieldAlert, dose: Pill } as const;
const activityTone = { good: "bg-sage-soft text-sage", warn: "bg-accent-soft text-[#8a5a10]", bad: "bg-flag-soft text-flag", neutral: "bg-panel text-mute", plum: "bg-plum-soft text-plum" } as const;
const priorityTone = { low: "neutral", normal: "brand", high: "bad" } as const;

/* The person at a glance: today, how they have been, who is around them, and what needs doing. */
export async function PersonOverviewTab({ id, person, home, lateMinutes }: { id: string; person: Person; home: Home | null; lateMinutes: number }) {
  const [data, now, next] = await Promise.all([personOverview(id, person.active ? person.homeId : null), requestTime(), nextAppointmentFor(id)]);
  const base = `/app/individuals/${id}`;
  const onNow = data.onShift.filter(shift => shift.startsAt.getTime() <= now && shift.endsAt.getTime() > now);

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Panel title="Medications today" action={<MoreLink href={`${base}?tab=medications`}>Full record</MoreLink>}>
          <DoseList doses={data.doses} now={now} lateMinutes={lateMinutes} canRecord={person.active} firstName={person.firstName} />
        </Panel>

        <Panel title="Mood over the last 30 days" action={<MoreLink href={`${base}?tab=logs`}>All daily logs</MoreLink>}>
          <div className="p-5">
            <MoodStrip days={data.mood} />
          </div>
        </Panel>

        <Panel title="Recent activity">
          {data.activity.length === 0 ? (
            <Empty>Nothing recorded yet.</Empty>
          ) : (
            <ol className="divide-y divide-line/60">
              {data.activity.map(item => {
                const Icon = activityIcon[item.kind];
                const body = (
                  <div className="flex items-start gap-3">
                    <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", activityTone[item.tone])}><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                        <span className="font-semibold first-letter:uppercase">{item.title}</span>
                        <span className="text-xs text-dim">{fmt.dateTime(item.at)}</span>
                      </p>
                      {item.body && <p className="mt-0.5 line-clamp-2 text-sm text-mute">{item.body}</p>}
                    </div>
                  </div>
                );
                return (
                  <li key={item.key}>
                    {item.href ? <Link href={item.href} className="block px-5 py-3 hover:bg-panel/60">{body}</Link> : <div className="px-5 py-3">{body}</div>}
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel title="Next appointment" action={<MoreLink href={`${base}?tab=appointments`}>All appointments</MoreLink>}>
          {next ? (
            <Link href={`/app/appointments/${next.id}`} className="flex items-start gap-3 px-5 py-4 hover:bg-panel/50">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-plum-soft text-plum"><Stethoscope className="h-5 w-5" /></span>
              <span className="min-w-0 text-sm">
                <span className="block font-semibold">{next.type}{next.provider ? ` · ${next.provider}` : ""}</span>
                <span className="block text-mute">{fmt.dateTime(next.scheduledAt)}{next.clinic ? ` · ${next.clinic}` : ""}</span>
                <span className={next.escort ? "block text-xs text-mute" : "block text-xs font-semibold text-[#8a5a10]"}>{next.escort ? `With ${next.escort}` : "No escort chosen yet"}</span>
              </span>
            </Link>
          ) : (
            <Empty>Nothing booked.</Empty>
          )}
        </Panel>

        <Panel title={`How to support ${person.firstName} well`} action={<MoreLink href={`${base}?tab=profile`}>Profile</MoreLink>}>
          <p className="whitespace-pre-line p-5 text-sm leading-relaxed">{person.supportNotes || "No support notes yet. Coordinators add these with Edit details."}</p>
        </Panel>

        {home && person.active && (
          <Panel title={`Staff at ${home.name} today`} action={<MoreLink href={`/app/schedule?home=${home.id}&view=day`}>Schedule</MoreLink>}>
            {data.onShift.length === 0 ? (
              <Empty>No shifts scheduled today.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {data.onShift.map(shift => {
                  const working = onNow.includes(shift);
                  return (
                    <li key={shift.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", working ? "bg-sage" : "bg-line")} title={working ? "On shift now" : undefined} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {shift.staffId ? <Link href={`/app/staff/${shift.staffId}`} className="hover:text-brand">{shift.staff}</Link> : <span className="text-flag">Open shift</span>}
                        </p>
                        <p className="text-xs text-mute">{label("shiftKind", shift.kind)} · {fmt.time(shift.startsAt)} – {fmt.time(shift.endsAt)}{working ? " · on now" : ""}</p>
                      </div>
                      {shift.phone && <a href={`tel:${shift.phone}`} className="text-brand" aria-label={`Call ${shift.staff}`}><Phone className="h-4 w-4" /></a>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        )}

        <Panel title="Who knows them best">
          {data.team.length === 0 ? (
            <Empty>No logs or doses recorded in the last 60 days.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {data.team.map(member => (
                <li key={member.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar initials={initials(member.firstName, member.lastName)} size="sm" />
                  <div className="min-w-0 flex-1 text-sm">
                    <Link href={`/app/staff/${member.id}`} className="font-semibold hover:text-brand">{member.firstName} {member.lastName}</Link>
                    <p className="text-xs text-mute">
                      {[member.logs ? `${member.logs} ${member.logs === 1 ? "log" : "logs"}` : null, member.doses ? `${member.doses} ${member.doses === 1 ? "dose" : "doses"}` : null].filter(Boolean).join(", ")} · last {fmt.day(member.lastAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-line px-5 py-2.5 text-xs text-dim">From daily logs and medication records in the last 60 days.</p>
        </Panel>

        <Panel title="Goals in progress" action={<MoreLink href={`${base}?tab=plan`}>Care plan</MoreLink>}>
          {data.goals.length === 0 ? (
            <Empty>No active goals.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {data.goals.map(goal => (
                <li key={goal.id} className="px-5 py-3 text-sm">
                  <p className="font-semibold">{goal.title}</p>
                  {goal.targetDate && <p className="text-xs text-mute">Target {fmt.dayLong(goal.targetDate)}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Open tasks" action={<MoreLink href={`${base}?tab=tasks`}>All tasks</MoreLink>}>
          {data.tasks.length === 0 ? (
            <Empty>Nothing to follow up.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {data.tasks.map(task => {
                const overdue = task.dueAt && task.dueAt.getTime() < now;
                return (
                  <li key={task.id} className="px-5 py-3 text-sm">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {task.title}
                      <Badge tone={priorityTone[task.priority]}>{label("taskPriority", task.priority)}</Badge>
                      {overdue && <Badge tone="bad">Overdue</Badge>}
                    </p>
                    {task.dueAt && <p className="text-xs text-mute">Due {fmt.dateTime(task.dueAt)}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
