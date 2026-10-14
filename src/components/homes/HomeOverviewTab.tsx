import Link from "next/link";
import { ArrowRight, Mail, Phone, Pill, Receipt, Users, Wrench } from "lucide-react";
import { Avatar, Badge, Empty, Panel, Stat } from "@/components/app/ui";
import { fmt, initials, label, money } from "@/lib/format";
import { requestTime } from "@/server/clock";
import type { homeHub } from "@/server/queries/homes";

type Hub = NonNullable<Awaited<ReturnType<typeof homeHub>>>;

const priorityTone = { low: "neutral", normal: "brand", high: "warn", urgent: "bad" } as const;

export async function HomeOverviewTab({ hub, homeId }: { hub: Hub; homeId: string }) {
  const { home, manager, residents, team, shiftsToday, meds, money: spend, recentIssues } = hub;
  const budget = home.monthlyBudgetCents;
  const pct = budget ? Math.round((spend.spentCents / budget) * 100) : null;
  const now = await requestTime();
  const onNow = shiftsToday.filter(shift => shift.startsAt.getTime() <= now && shift.endsAt.getTime() > now);
  const later = shiftsToday.filter(shift => shift.startsAt.getTime() > now);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="People living here" value={`${residents.length}/${home.capacity}`} hint={`${home.capacity - residents.length} places free`} icon={Users} />
        <Stat
          label="Medications today"
          value={`${meds.given}/${meds.total}`}
          hint={meds.late ? `${meds.late} running late` : meds.nextDue ? `Next round ${fmt.time(meds.nextDue)}` : "Nothing more due today"}
          icon={Pill}
          tone={meds.late ? "bad" : "plum"}
          href={`/app/homes/${homeId}?tab=medications`}
        />
        <Stat
          label="Open issues"
          value={spend.openIssues}
          hint={spend.urgentIssues ? `${spend.urgentIssues} urgent` : "Nothing urgent"}
          icon={Wrench}
          tone={spend.urgentIssues ? "bad" : spend.openIssues ? "warn" : "good"}
          href={`/app/homes/${homeId}?tab=issues`}
        />
        <Stat
          label="Spent this month"
          value={money(spend.spentCents, true)}
          hint={budget ? `${pct}% of ${money(budget, true)} budget${spend.pendingCount ? ` · ${spend.pendingCount} waiting` : ""}` : spend.pendingCount ? `${spend.pendingCount} waiting for approval` : "No budget set"}
          icon={Receipt}
          tone={pct !== null && pct > 100 ? "bad" : pct !== null && pct > 85 ? "warn" : "brand"}
          href={`/app/homes/${homeId}?tab=expenses`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="Who is on today">
            {shiftsToday.length === 0 ? (
              <Empty>No shifts here today.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {[...onNow, ...later].map(shift => (
                  <li key={shift.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <Avatar initials={shift.first ? initials(shift.first, shift.last ?? "") : "?"} size="sm" tone={shift.first ? "brand" : "bad"} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{shift.first ? `${shift.first} ${shift.last}` : "Open shift"}</span>
                      <span className="text-xs text-mute">{label("shiftKind", shift.kind)} · {fmt.time(shift.startsAt)} to {fmt.time(shift.endsAt)}</span>
                    </span>
                    {onNow.includes(shift) ? <Badge tone="good">On now</Badge> : <Badge tone="neutral">Later</Badge>}
                    {shift.phone && <a href={`tel:${shift.phone}`} className="text-mute hover:text-ink" aria-label={`Call ${shift.first}`}><Phone className="h-4 w-4" /></a>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`People living here (${residents.length})`}>
            {residents.length === 0 ? (
              <Empty>No one lives here at the moment.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {residents.map(person => (
                  <li key={person.id}>
                    <Link href={`/app/individuals/${person.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-panel/50">
                      <Avatar initials={initials(person.first, person.last)} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{person.first} {person.last}</span>
                        <span className={person.allergies ? "text-xs font-semibold text-flag" : "text-xs text-mute"}>
                          {person.allergies ? `Allergy: ${person.allergies}` : label("serviceType", person.serviceType)}
                        </span>
                      </span>
                      <span className="text-xs text-mute">{person.meds} {person.meds === 1 ? "med" : "meds"}</span>
                      {person.loggedToday ? <Badge tone="good">Logged</Badge> : <Badge tone="warn">Needs log</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Home manager">
            {manager ? (
              <div className="flex items-start gap-3 p-5 text-sm">
                <Avatar initials={initials(manager.firstName, manager.lastName)} />
                <div className="min-w-0">
                  <Link href={`/app/staff/${manager.id}`} className="font-semibold hover:text-brand">{manager.firstName} {manager.lastName}</Link>
                  <p className="text-xs text-mute">{label("staffRole", manager.role)}</p>
                  <div className="mt-2 flex flex-col gap-1 text-xs">
                    {manager.phone && <a href={`tel:${manager.phone}`} className="inline-flex items-center gap-1.5 text-brand"><Phone className="h-3.5 w-3.5" />{manager.phone}</a>}
                    <a href={`mailto:${manager.email}`} className="inline-flex items-center gap-1.5 text-brand"><Mail className="h-3.5 w-3.5" />{manager.email}</a>
                  </div>
                </div>
              </div>
            ) : (
              <Empty>No home manager set. A coordinator sets one under Details.</Empty>
            )}
          </Panel>

          {(home.notes || home.licenseNumber || home.openedOn || home.county) && (
            <Panel title="About this home">
              <dl className="grid gap-3 p-5 text-sm">
                {home.notes && (
                  <div>
                    <dt className="label">House notes</dt>
                    <dd className="whitespace-pre-line">{home.notes}</dd>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {home.county && <div><dt className="label">County</dt><dd>{home.county}</dd></div>}
                  {home.openedOn && <div><dt className="label">Opened</dt><dd>{fmt.day(home.openedOn)}</dd></div>}
                  {home.licenseNumber && <div><dt className="label">Licence</dt><dd>{home.licenseNumber}</dd></div>}
                </div>
              </dl>
            </Panel>
          )}

          <Panel title="Open issues" action={<Link href={`/app/homes/${homeId}?tab=issues`} className="text-xs font-semibold text-brand">All issues <ArrowRight className="inline h-3 w-3" /></Link>}>
            {recentIssues.length === 0 ? (
              <Empty>Nothing reported.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {recentIssues.map(issue => (
                  <li key={issue.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                    <span>
                      <span className="block font-semibold">{issue.title}</span>
                      <span className="text-xs text-mute">{issue.category} · {label("issueStatus", issue.status)}</span>
                    </span>
                    <Badge tone={priorityTone[issue.priority]}>{label("issuePriority", issue.priority)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`Staff based here (${team.length})`}>
            {team.length === 0 ? (
              <Empty>No staff are based here. Staff can still work shifts here.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {team.map(person => (
                  <li key={person.id}>
                    <Link href={`/app/staff/${person.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-panel/50">
                      <Avatar initials={initials(person.first, person.last)} size="sm" tone="neutral" />
                      <span className="flex-1 font-semibold">{person.first} {person.last}</span>
                      <span className="text-xs text-mute">{label("staffRole", person.role)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
