import Link from "next/link";
import { AlertTriangle, BadgeCheck, CalendarDays, CheckCircle2, ClipboardList, Clock, Home, ListChecks, Mail, MapPin, Phone, ShieldAlert, UserRound } from "lucide-react";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { LinkIssuer } from "@/components/app/LinkIssuer";
import { ModalForm } from "@/components/app/ModalForm";
import { Select } from "@/components/app/Select";
import { Badge, Empty, Field, Panel } from "@/components/app/ui";
import { MoodBadge, dayHead } from "@/components/logs/LogBrowserParts";
import { OwedShifts } from "@/components/logs/OwedShifts";
import { defaultLoginRole, loginRoleLabel, rolesActorMayGrant } from "@/lib/account-policy";
import { cn } from "@/lib/cn";
import { addDays, dateKey, daysBetween, fmt, label } from "@/lib/format";
import { createLogin, issueResetLink, setLoginActive, setLoginRole } from "@/server/actions/accounts";
import { removeCredential, setStaffActive } from "@/server/actions/editing";
import { addCredential } from "@/server/actions/hub";
import type { SessionUser } from "@/server/auth";
import { requestTime } from "@/server/clock";
import type { staffDetail } from "@/server/queries/hub";
import { homesWorked, notesWrittenBy, staffSummary, staffWeeks } from "@/server/queries/staff-profile";
import { rowMinutes, staffTime } from "@/server/queries/timeclock";
import { periodOn } from "@/server/queries/payroll";
import { getSettings } from "@/server/settings";
import { flagLabel, formatMinutes } from "@/lib/timeclock";

type Detail = NonNullable<Awaited<ReturnType<typeof staffDetail>>>;
type Summary = Awaited<ReturnType<typeof staffSummary>>;

const hours = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} h`;
const shiftHours = (shift: { startsAt: Date; endsAt: Date }) => (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000;

function Row({ icon: Icon, term, children }: { icon: typeof Mail; term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-5 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-mute" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-mute">{term}</dt>
        <dd className="mt-0.5 break-words text-sm">{children}</dd>
      </div>
    </div>
  );
}

const none = <span className="text-dim">Not recorded</span>;

/* ---------- Overview ---------- */

export async function StaffOverviewTab({ detail, summary, base, warningDays }: { detail: Detail; summary: Summary; base: string; warningDays: number }) {
  const { member, credentials } = detail;
  const today = dateKey();
  const [worked, clock] = await Promise.all([homesWorked(member.id), requestTime()]);
  const now = clock;
  const nextCreds = credentials.filter(cred => cred.expiresAt).slice(0, 4);
  const missing = summary.owed.flatMap(shift => shift.people.filter(person => !person.logId).map(person => ({ person, shift })));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <Panel title="This week" action={<Link href={`${base}?tab=schedule`} className="text-xs font-semibold text-brand">Full schedule</Link>}>
          {summary.weekShifts.length === 0 ? (
            <Empty>No shifts this week.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {summary.weekShifts.map(shift => {
                const past = shift.endsAt.getTime() < now;
                const day = dateKey(shift.startsAt);
                return (
                  <li key={shift.id} className={cn("flex items-center gap-4 px-5 py-3 text-sm", past && "text-mute")}>
                    <span className={cn("w-14 shrink-0 text-center", day === today && "font-bold text-brand")}>
                      <span className="block text-[11px] font-semibold uppercase">{day === today ? "Today" : dayHead(day).weekday}</span>
                      <span className="block font-display text-xl font-bold leading-none">{day.slice(8)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{shift.pattern ?? `${label("shiftKind", shift.kind)} shift`}</span>
                      <span className="block text-xs">{fmt.time(shift.startsAt)}–{fmt.time(shift.endsAt)} · <Link href={`/app/homes/${shift.homeId}?tab=schedule`} className="hover:text-brand">{shift.home}</Link></span>
                    </span>
                    <span className="text-xs tabular-nums">{hours(shiftHours(shift))}</span>
                    <Badge tone={shift.status === "missed" ? "bad" : shift.status === "confirmed" || shift.status === "completed" ? "good" : "neutral"}>{label("shiftStatus", shift.status)}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title={`Daily notes they owe${missing.length ? ` (${missing.length})` : ""}`} action={<Link href={`${base}?tab=notes`} className="text-xs font-semibold text-brand">All notes</Link>}>
          {missing.length === 0 ? (
            <p className="flex items-center gap-2 px-5 py-4 text-sm text-sage"><CheckCircle2 className="h-4 w-4" /> Every note from the last two weeks is written.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {missing.slice(0, 8).map(({ person, shift }) => (
                <li key={`${shift.shiftId}-${person.id}`} className="flex items-center gap-3 px-5 py-3 text-sm">
                  {shift.state === "overdue" ? <AlertTriangle className="h-4 w-4 shrink-0 text-flag" /> : <Clock className="h-4 w-4 shrink-0 text-brand" />}
                  <span className="min-w-0 flex-1">
                    <Link href={`/app/daily-logs/person/${person.id}/${shift.day}`} className="font-semibold hover:text-brand">{person.name}</Link>
                    <span className="block text-xs text-mute">{fmt.day(shift.day)} · {shift.pattern} · {shift.home}</span>
                  </span>
                  <Badge tone={shift.state === "overdue" ? "bad" : "warn"}>{shift.state === "overdue" ? "Overdue" : shift.state === "due" ? `Due ${fmt.time(shift.dueBy)}` : "On shift"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Open tasks${summary.tasks.length ? ` (${detail.openTasks})` : ""}`} action={<Link href={`/app/tasks?assignee=${member.id}`} className="text-xs font-semibold text-brand">Tasks</Link>}>
          {summary.tasks.length === 0 ? (
            <Empty>No open tasks.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {summary.tasks.map(task => {
                const late = task.dueAt && task.dueAt.getTime() < now;
                return (
                  <li key={task.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <ListChecks className="h-4 w-4 shrink-0 text-mute" />
                    <span className="min-w-0 flex-1">
                      <Link href={`/app/tasks/${task.id}`} className="font-semibold hover:text-brand">{task.title}</Link>
                      {task.person && <span className="block text-xs text-mute">{task.person}</span>}
                    </span>
                    {task.dueAt && <span className={cn("text-xs", late ? "font-semibold text-flag" : "text-mute")}>{late ? "Overdue · " : "Due "}{fmt.day(task.dueAt)}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <aside className="space-y-6">
        <Panel title="Contact">
          <dl className="divide-y divide-line/60">
            <Row icon={Phone} term="Phone">{member.phone ? <a href={`tel:${member.phone}`} className="font-semibold text-brand">{member.phone}</a> : none}</Row>
            <Row icon={Mail} term="Email"><a href={`mailto:${member.email}`} className="text-brand">{member.email}</a></Row>
            <Row icon={MapPin} term="Address">{member.address || none}</Row>
            <Row icon={ShieldAlert} term="Emergency contact">
              {member.emergencyContact ? (
                <>
                  {member.emergencyContact}
                  {member.emergencyPhone && <> · <a href={`tel:${member.emergencyPhone}`} className="font-semibold text-brand">{member.emergencyPhone}</a></>}
                </>
              ) : (
                none
              )}
            </Row>
          </dl>
        </Panel>

        <Panel title="Credentials" action={<Link href={`${base}?tab=credentials`} className="text-xs font-semibold text-brand">All</Link>}>
          {nextCreds.length === 0 ? (
            <Empty>No dated credentials recorded.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {nextCreds.map(cred => {
                const days = daysBetween(today, cred.expiresAt!);
                return (
                  <li key={cred.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="flex items-center gap-2 font-semibold"><BadgeCheck className={cn("h-4 w-4", days < 0 ? "text-flag" : days <= warningDays ? "text-[#8a5a10]" : "text-sage")} /> {cred.type}</span>
                    <span className={cn("text-xs", days < 0 ? "font-semibold text-flag" : days <= warningDays ? "font-semibold text-[#8a5a10]" : "text-mute")}>
                      {days < 0 ? `Expired ${fmt.day(cred.expiresAt)}` : days === 0 ? "Expires today" : `${fmt.day(cred.expiresAt)} · ${days}d`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Where they work">
          {worked.length === 0 ? (
            <Empty>No shifts in the last 90 days.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {worked.map(row => (
                <li key={row.homeId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <Link href={`/app/homes/${row.homeId}`} className="flex items-center gap-2 font-semibold hover:text-brand"><Home className="h-4 w-4 text-mute" /> {row.home}</Link>
                  <span className="text-xs text-mute">{row.n} shifts</span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-line px-5 py-2.5 text-xs text-dim">Last 90 days.</p>
        </Panel>
      </aside>
    </div>
  );
}

/* ---------- Schedule ---------- */

export async function StaffScheduleTab({ id, overtime }: { id: string; overtime: number }) {
  const weeks = await staffWeeks(id, 4, 3);
  const thisWeek = addDays(dateKey(), 0);
  return (
    <div className="space-y-5">
      <p className="text-sm text-mute">Three weeks ahead and four weeks back. Weeks over {overtime} hours are flagged, as set in Settings.</p>
      {weeks.map(week => {
        const current = thisWeek >= week.start && thisWeek < addDays(week.start, 7);
        const over = week.hours > overtime;
        return (
          <Panel
            key={week.start}
            title={`${current ? "This week · " : ""}${fmt.day(week.start)} – ${fmt.day(addDays(week.start, 6))}`}
            action={<span className={cn("chip", over ? "bg-flag-soft text-flag" : week.hours ? "bg-sky text-brand-deep" : "bg-panel text-mute")}>{hours(week.hours)}{over ? " · over" : ""}</span>}
            className={current ? "ring-2 ring-brand/30" : undefined}
          >
            {week.shifts.length === 0 ? (
              <Empty>No shifts.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr><th>Day</th><th>Shift</th><th>Home</th><th className="text-right">Hours</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {week.shifts.map(shift => (
                      <tr key={shift.id}>
                        <td className="whitespace-nowrap font-semibold">{fmt.day(shift.startsAt)}</td>
                        <td className="whitespace-nowrap">{shift.pattern ?? label("shiftKind", shift.kind)} <span className="text-xs text-mute">{fmt.time(shift.startsAt)}–{fmt.time(shift.endsAt)}</span></td>
                        <td><Link href={`/app/homes/${shift.homeId}?tab=schedule`} className="hover:text-brand">{shift.home}</Link></td>
                        <td className="text-right tabular-nums">{hours(shiftHours(shift))}</td>
                        <td><Badge tone={shift.status === "missed" ? "bad" : shift.status === "confirmed" || shift.status === "completed" ? "good" : "neutral"}>{label("shiftStatus", shift.status)}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}

/* ---------- Daily notes ---------- */

export async function StaffNotesTab({ detail, summary, myStaffId }: { detail: Detail; summary: Summary; myStaffId: string | null }) {
  const written = await notesWrittenBy(detail.member.id);
  const name = `${detail.member.firstName} ${detail.member.lastName}`;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Notes owed from shifts, last two weeks">
        <OwedShifts shifts={[...summary.owed].reverse()} myStaffId={myStaffId} showComplete={false} empty="Every note from the last two weeks is written." />
      </Panel>
      <Panel title="Notes written" action={<Link href={`/app/daily-logs?view=notes&q=${encodeURIComponent(name)}`} className="text-xs font-semibold text-brand">Search all</Link>}>
        {written.length === 0 ? (
          <Empty>No notes written yet.</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {written.map(note => (
              <li key={note.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <ClipboardList className="h-4 w-4 shrink-0 text-mute" />
                <span className="min-w-0 flex-1">
                  <Link href={`/app/daily-logs/${note.id}`} className="font-semibold hover:text-brand">{note.first} {note.last}</Link>
                  <span className="block text-xs text-mute">{fmt.day(note.logDate)}{note.shiftName ? ` · ${note.shiftName}` : ""}{dateKey(note.createdAt) > note.logDate ? " · late entry" : ""}</span>
                </span>
                <MoodBadge mood={note.mood} />
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-line px-5 py-2.5 text-xs text-dim">{summary.notes30} written in the last 30 days.</p>
      </Panel>
    </div>
  );
}

/* ---------- Credentials ---------- */

export function StaffCredentialsTab({ detail, manager, warningDays, credentialTypes }: { detail: Detail; manager: boolean; warningDays: number; credentialTypes: string[] }) {
  const { member, credentials } = detail;
  const today = dateKey();
  return (
    <Panel
      title={`Credentials${credentials.length ? ` (${credentials.length})` : ""}`}
      action={
        manager && member.active ? (
          <ModalForm action={addCredential} title="Add a credential" description="Renewed a certificate? Add the new one, then remove the old one." triggerLabel="Add credential" submitLabel="Save credential">
            <input type="hidden" name="staffId" value={member.id} />
            <Field label="Credential" htmlFor="cred-type">
              <Select id="cred-type" name="type" defaultValue={credentialTypes[0]} options={credentialTypes.map(type => ({ value: type, label: type }))} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Issued" htmlFor="cred-issued"><input id="cred-issued" name="issuedAt" type="date" className="field" /></Field>
              <Field label="Expires" htmlFor="cred-expires" hint="Leave empty if it does not expire."><input id="cred-expires" name="expiresAt" type="date" className="field" /></Field>
            </div>
            <Field label="Note" htmlFor="cred-note"><input id="cred-note" name="note" maxLength={300} className="field" placeholder="Certificate number, provider" /></Field>
          </ModalForm>
        ) : undefined
      }
    >
      {credentials.length === 0 ? (
        <Empty>No credentials recorded yet.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Credential</th><th>Issued</th><th>Expires</th><th>Note</th>{manager && <th className="text-right">Remove</th>}</tr></thead>
            <tbody>
              {credentials.map(cred => {
                const days = cred.expiresAt ? daysBetween(today, cred.expiresAt) : null;
                const tone = days === null ? "neutral" : days < 0 ? "bad" : days <= warningDays ? "warn" : "good";
                return (
                  <tr key={cred.id}>
                    <td className="font-semibold">{cred.type}</td>
                    <td className="whitespace-nowrap text-mute">{cred.issuedAt ? fmt.day(cred.issuedAt) : "—"}</td>
                    <td className="whitespace-nowrap"><Badge tone={tone}>{days === null ? "No expiry" : days < 0 ? `Expired ${fmt.day(cred.expiresAt)}` : days === 0 ? "Today" : `${fmt.day(cred.expiresAt)} · ${days}d`}</Badge></td>
                    <td className="text-xs text-mute">{cred.note || "—"}</td>
                    {manager && (
                      <td className="text-right">
                        <ConfirmAction action={removeCredential.bind(null, cred.id, member.id)} label="Remove" confirm={`Remove ${cred.type}? Add the renewed one first if it was renewed.`} className="justify-items-end" />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-line px-5 py-2.5 text-xs text-dim">Credential types and the warning window are set in Settings. Certificates uploaded through Documents update this list when approved.</p>
    </Panel>
  );
}

/* ---------- Login and employment ---------- */

export function StaffAccountTab({ detail, user, manager, self, manageable }: { detail: Detail; user: SessionUser; manager: boolean; self: boolean; manageable: boolean }) {
  const { member, login } = detail;
  const grantable = rolesActorMayGrant(user);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Mohuddle login">
        <div className="space-y-4 p-5 text-sm">
          {!login ? (
            <>
              <p className="text-mute">{member.firstName} cannot sign in yet. Create a login to get a one-time link. They open it, choose a password, and they are in.</p>
              {manager && member.active && grantable.length > 0 ? (
                <LinkIssuer action={createLogin.bind(null, member.id)} label="Create login and get link">
                  <Field label="Access level" htmlFor="login-role">
                    <Select id="login-role" name="role" defaultValue={grantable.includes(defaultLoginRole(member.role)) ? defaultLoginRole(member.role) : grantable[0]} options={grantable.map(role => ({ value: role, label: loginRoleLabel[role] }))} />
                  </Field>
                </LinkIssuer>
              ) : (
                <p className="text-xs text-dim">{member.active ? "A coordinator or administrator creates logins." : "People who have left cannot be given a login."}</p>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={login.active ? "good" : "neutral"}>{login.active ? "Login on" : "Login off"}</Badge>
                <Badge tone="brand" className="capitalize">{login.role}</Badge>
                {!login.hasPassword && <Badge tone="warn">Waiting for first sign-in</Badge>}
              </div>
              <p className="text-mute">
                Signs in as <span className="font-semibold text-ink">{login.email}</span>.
                {detail.pendingLink && <> An unused {detail.pendingLink.purpose === "invite" ? "setup" : "reset"} link is valid until {fmt.dateTime(detail.pendingLink.expiresAt)}.</>}
              </p>
              {self && <p className="text-xs text-dim">This is your own login. Change your password from <Link href="/app/account" className="font-semibold text-brand">My account</Link>.</p>}
              {manageable && (
                <div className="space-y-4 border-t border-line pt-4">
                  {login.active && (
                    <div>
                      <p className="mb-2 text-xs text-mute">{login.hasPassword ? "Forgot their password? Their current password keeps working until they choose a new one." : "Lost the first link? A new one replaces it."}</p>
                      <LinkIssuer action={issueResetLink.bind(null, login.id)} label={login.hasPassword ? "Get a password reset link" : "Get a new setup link"} />
                    </div>
                  )}
                  {member.active && (
                    <ConfirmAction action={setLoginRole.bind(null, login.id)} label="Change access" confirm="Change this person's access? They will be signed out everywhere.">
                      <Field label="Access level" htmlFor="change-role">
                        <Select id="change-role" name="role" defaultValue={login.role} options={grantable.map(role => ({ value: role, label: loginRoleLabel[role] }))} />
                      </Field>
                    </ConfirmAction>
                  )}
                  {login.active ? (
                    <ConfirmAction action={setLoginActive.bind(null, login.id, false)} label="Turn login off" tone="danger" confirm="Turn this login off? They are signed out at once and cannot sign in until it is turned back on." />
                  ) : (
                    member.active && <ConfirmAction action={setLoginActive.bind(null, login.id, true)} label="Turn login back on" />
                  )}
                </div>
              )}
              {manager && !self && !manageable && <p className="text-xs text-dim">Only an administrator can manage this login.</p>}
            </>
          )}
        </div>
      </Panel>

      <Panel title="Employment">
        <dl className="divide-y divide-line/60">
          <Row icon={UserRound} term="Job">{label("staffRole", member.role)}{member.employmentType && ` · ${member.employmentType}`}</Row>
          <Row icon={CalendarDays} term="Hired">{member.hiredAt ? fmt.dayLong(member.hiredAt) : none}</Row>
          <Row icon={BadgeCheck} term="Employee number">{member.employeeNumber || none}</Row>
          <Row icon={Home} term="Based at">{detail.home ? <Link href={`/app/homes/${detail.home.id}`} className="font-semibold text-brand">{detail.home.name}</Link> : "Floating or office"}</Row>
        </dl>
        {manageable && (
          <div className="space-y-3 border-t border-line p-5 text-sm">
            {member.active ? (
              <>
                <p className="text-mute">
                  When someone leaves, their login turns off at once. Their {detail.upcomingShifts} upcoming {detail.upcomingShifts === 1 ? "shift becomes" : "shifts become"} open, and their {detail.openTasks} open{" "}
                  {detail.openTasks === 1 ? "task becomes" : "tasks become"} unassigned. Their notes and records stay.
                </p>
                <ConfirmAction action={setStaffActive.bind(null, member.id, false)} label="Mark as left" tone="danger" confirm={`Mark ${member.firstName} ${member.lastName} as left? Their login turns off and their upcoming shifts open up.`} />
              </>
            ) : (
              <>
                <p className="text-mute">Returning staff are listed again. Their login stays off until you turn it back on.</p>
                <ConfirmAction action={setStaffActive.bind(null, member.id, true)} label="Mark as returned" />
              </>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ---------- Time ---------- */

export async function StaffTimeTab({ id, manager }: { id: string; manager: boolean }) {
  const now = await requestTime();
  const [time, settings] = await Promise.all([staffTime(id, now), getSettings()]);
  const open = time.rows.find(row => !row.clockOutAt);
  const period = await periodOn(dateKey(new Date(now)), settings);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Now</p>
          <p className={cn("mt-1 font-display text-xl font-bold", open ? "text-sage" : "text-mute")}>{open ? "On the clock" : "Off"}</p>
          <p className="text-xs text-mute">{open ? `Since ${fmt.time(open.clockInAt)} at ${open.home ?? "work"}` : "Not clocked in"}</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Worked this week</p>
          <p className="mt-1 font-display text-xl font-bold">{formatMinutes(time.weekMinutes)}</p>
          <p className="text-xs text-mute">From Monday, less meal breaks</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Late, 3 weeks</p>
          <p className={cn("mt-1 font-display text-xl font-bold", time.lateCount ? "text-[#8a5a10]" : "text-sage")}>{time.lateCount}</p>
          <p className="text-xs text-mute">Clock-ins past the grace period</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">To review</p>
          <p className={cn("mt-1 font-display text-xl font-bold", time.flagged ? "text-flag" : "text-sage")}>{time.flagged}</p>
          <p className="text-xs text-mute">Flagged punches not yet looked at</p>
        </div>
      </div>
      {manager && (
        <p className="text-sm">
          <Link href={`/app/time/sheets/${period.start}/${id}`} className="font-semibold text-brand">Timesheet for this pay period</Link>
          <span className="text-mute"> · {fmt.day(period.start)} – {fmt.day(period.end)}</span>
        </p>
      )}
      <Panel title="Punches, last three weeks" action={manager ? <Link href={`/app/time?tab=punches&staff=${id}`} className="text-xs font-semibold text-brand">All punches</Link> : undefined}>
        {time.rows.length === 0 ? (
          <Empty>No punches yet. Staff clock in from My time clock on their phone.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Day</th><th>Home</th><th>In – out</th><th className="text-right">Worked</th><th>Flags</th></tr></thead>
              <tbody>
                {time.rows.map(row => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap font-semibold">{manager ? <Link href={`/app/time/${row.id}`} className="hover:text-brand">{fmt.day(row.clockInAt)}</Link> : fmt.day(row.clockInAt)}</td>
                    <td className="text-mute">{row.home ?? "—"}</td>
                    <td className="whitespace-nowrap">{fmt.time(row.clockInAt)} – {row.clockOutAt ? fmt.time(row.clockOutAt) : <Badge tone="good">On now</Badge>}</td>
                    <td className="text-right tabular-nums">{formatMinutes(rowMinutes(row, now))}</td>
                    <td><span className="flex flex-wrap gap-1">{row.flags.map(flag => <Badge key={flag} tone={["late", "edited", "corrected"].includes(flag) ? "neutral" : "warn"}>{flagLabel(flag)}</Badge>)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
