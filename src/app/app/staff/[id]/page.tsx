import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, ClipboardList, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { LinkIssuer } from "@/components/app/LinkIssuer";
import { ModalForm } from "@/components/app/ModalForm";
import { StaffFields } from "@/components/app/StaffFields";
import { Avatar, Badge, Empty, Field, PageHeader, Panel } from "@/components/app/ui";
import { defaultLoginRole, loginRoleLabel, mayManageLogin, rolesActorMayGrant } from "@/lib/account-policy";
import { dateKey, daysBetween, fmt, initials, label } from "@/lib/format";
import { createLogin, issueResetLink, setLoginActive, setLoginRole } from "@/server/actions/accounts";
import { addCredential } from "@/server/actions/hub";
import { removeCredential, setStaffActive, updateStaff } from "@/server/actions/editing";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { listHomes, staffDetail } from "@/server/queries/hub";
import { staffActivity } from "@/server/queries/staff";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Staff member" };

function tenure(hiredAt: string | null, today: string) {
  if (!hiredAt) return null;
  const days = daysBetween(hiredAt, today);
  if (days < 0) return `Starts ${fmt.day(hiredAt)}`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years === 0 && months === 0) return "Joined this month";
  return "With Milestone " + [years ? `${years} year${years === 1 ? "" : "s"}` : null, months ? `${months} month${months === 1 ? "" : "s"}` : null].filter(Boolean).join(", ");
}

export default async function StaffMemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { created } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, homes, settings, activity] = await Promise.all([staffDetail(id), listHomes(), getSettings(), staffActivity(id)]);
  if (!detail) notFound();
  const { member, login, credentials } = detail;
  const manager = canManage(user);
  const self = user.staffId === member.id;
  const manageable = manager && !self && (!login || mayManageLogin(user, login));
  const grantable = rolesActorMayGrant(user);
  const today = dateKey();
  const expired = credentials.filter(cred => cred.expiresAt && cred.expiresAt < today).length;
  const served = tenure(member.hiredAt, today);

  return (
    <div className="max-w-6xl">
      <Link href="/app/staff" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All staff
      </Link>

      <PageHeader
        eyebrow={label("staffRole", member.role)}
        title={`${member.firstName} ${member.lastName}`}
        description={[detail.home ? `Based at ${detail.home.name}` : "Floating or office", served].filter(Boolean).join(" · ")}
        action={
          manager ? (
            <div className="flex flex-wrap items-center gap-2">
              <ModalForm
                action={updateStaff.bind(null, member.id)}
                title={`Edit ${member.firstName}'s details`}
                triggerLabel="Edit details"
                triggerIcon="pencil"
                triggerTone="ghost"
                submitLabel="Save details"
              >
                <StaffFields homes={homes} member={member} prefix="edit-staff" loginEmail={Boolean(login)} />
              </ModalForm>
              {member.active && (
                <ModalForm
                  action={addCredential}
                  title="Add a credential"
                  description="Renewed a certificate? Add the new one, then remove the old one from the list."
                  triggerLabel="Add credential"
                  submitLabel="Save credential"
                >
                  <input type="hidden" name="staffId" value={member.id} />
                  <Field label="Credential" htmlFor="cred-type">
                    <select id="cred-type" name="type" className="field">{settings.credential_types.map(type => <option key={type} value={type}>{type}</option>)}</select>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Issued" htmlFor="cred-issued"><input id="cred-issued" name="issuedAt" type="date" className="field" /></Field>
                    <Field label="Expires" htmlFor="cred-expires" hint="Leave empty if it does not expire."><input id="cred-expires" name="expiresAt" type="date" className="field" /></Field>
                  </div>
                  <Field label="Note" htmlFor="cred-note"><input id="cred-note" name="note" maxLength={300} className="field" placeholder="Certificate number, provider" /></Field>
                  <p className="text-xs text-mute">The list of credential types is set in Settings.</p>
                </ModalForm>
              )}
            </div>
          ) : undefined
        }
      />

      {created && (
        <p className="mb-6 rounded-xl bg-sage-soft px-4 py-3 text-sm font-medium text-sage">
          {member.firstName} has been added. Next, create their Hub login and add their credentials.
        </p>
      )}
      {!member.active && (
        <p className="mb-6 rounded-xl bg-panel px-4 py-3 text-sm font-medium text-mute">{member.firstName} has left Milestone. Their records stay on file.</p>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="Profile">
            <div className="flex flex-col gap-5 p-5 sm:flex-row">
              <Avatar initials={initials(member.firstName, member.lastName)} size="lg" tone={member.active ? "brand" : "neutral"} />
              <dl className="grid flex-1 gap-4 text-sm sm:grid-cols-2">
                <div className="flex gap-2.5"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-mute" aria-hidden="true" /><div><dt className="label">Email</dt><dd><a href={`mailto:${member.email}`} className="text-brand">{member.email}</a></dd></div></div>
                <div className="flex gap-2.5"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-mute" aria-hidden="true" /><div><dt className="label">Phone</dt><dd>{member.phone ? <a href={`tel:${member.phone}`} className="text-brand">{member.phone}</a> : "Not recorded"}</dd></div></div>
                <div className="flex gap-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-mute" aria-hidden="true" /><div><dt className="label">Based at</dt><dd>{detail.home ? detail.home.name : "Floating or office"}</dd></div></div>
                <div className="flex gap-2.5"><UserRound className="mt-0.5 h-4 w-4 shrink-0 text-mute" aria-hidden="true" /><div><dt className="label">Hired</dt><dd>{member.hiredAt ? fmt.dayLong(member.hiredAt) : "Not recorded"}</dd></div></div>
              </dl>
            </div>
          </Panel>

          <Panel title={`Credentials${credentials.length ? ` (${credentials.length})` : ""}`} action={expired ? <Badge tone="bad">{expired} expired</Badge> : undefined}>
            {credentials.length === 0 ? (
              <Empty>No credentials recorded yet.{manager && member.active ? " Use Add credential at the top of the page." : ""}</Empty>
            ) : (
              <table className="table">
                <thead><tr><th>Credential</th><th>Issued</th><th>Expires</th><th>Note</th>{manager && <th className="text-right">Remove</th>}</tr></thead>
                <tbody>
                  {credentials.map(cred => {
                    const days = cred.expiresAt ? daysBetween(today, cred.expiresAt) : null;
                    const tone = days === null ? "neutral" : days < 0 ? "bad" : days <= settings.credential_warning_days ? "warn" : "good";
                    return (
                      <tr key={cred.id}>
                        <td className="font-semibold">{cred.type}</td>
                        <td className="whitespace-nowrap text-mute">{cred.issuedAt ? fmt.day(cred.issuedAt) : "—"}</td>
                        <td className="whitespace-nowrap">
                          <Badge tone={tone}>{days === null ? "No expiry" : days < 0 ? `Expired ${fmt.day(cred.expiresAt)}` : days === 0 ? "Today" : `${fmt.day(cred.expiresAt)} · ${days}d`}</Badge>
                        </td>
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
            )}
          </Panel>

          <Panel title="Upcoming shifts" action={<Link href="/app/schedule" className="text-xs font-semibold text-brand">Schedule</Link>}>
            {activity.shifts.length === 0 ? (
              <Empty>No upcoming shifts.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {activity.shifts.map(shift => (
                  <li key={shift.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="flex items-center gap-3">
                      <CalendarDays className="h-4 w-4 text-mute" aria-hidden="true" />
                      <span>
                        <span className="font-semibold">{fmt.dateTime(shift.startsAt)}</span>
                        <span className="text-mute"> to {fmt.time(shift.endsAt)} · {shift.home}</span>
                      </span>
                    </span>
                    <Badge tone={shift.status === "confirmed" ? "good" : "neutral"}>{label("shiftKind", shift.kind)} · {label("shiftStatus", shift.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Hub login">
            <div className="space-y-4 p-5 text-sm">
              {!login ? (
                <>
                  <p className="text-mute">
                    {member.firstName} cannot sign in to the Hub yet. Create a login to get a one-time link. They open it,
                    choose a password, and they are in.
                  </p>
                  {manager && member.active && grantable.length > 0 ? (
                    <LinkIssuer action={createLogin.bind(null, member.id)} label="Create login and get link">
                      <Field label="Access level" htmlFor="login-role">
                        <select id="login-role" name="role" className="field" defaultValue={grantable.includes(defaultLoginRole(member.role)) ? defaultLoginRole(member.role) : grantable[0]}>
                          {grantable.map(role => <option key={role} value={role}>{loginRoleLabel[role]}</option>)}
                        </select>
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
                          <p className="mb-2 text-xs text-mute">
                            {login.hasPassword ? "Forgot their password? Their current password keeps working until they choose a new one." : "Lost the first link? A new one replaces it."}
                          </p>
                          <LinkIssuer action={issueResetLink.bind(null, login.id)} label={login.hasPassword ? "Get a password reset link" : "Get a new setup link"} />
                        </div>
                      )}
                      {member.active && (
                        <ConfirmAction action={setLoginRole.bind(null, login.id)} label="Change access" confirm="Change this person's access? They will be signed out everywhere.">
                          <Field label="Access level" htmlFor="change-role">
                            <select id="change-role" name="role" className="field" defaultValue={login.role}>
                              {grantable.map(role => <option key={role} value={role}>{loginRoleLabel[role]}</option>)}
                            </select>
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

          <Panel title="Activity">
            <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
              <div><dt className="label">Logs, last 30 days</dt><dd className="font-display text-2xl font-bold">{activity.logsLast30Days}</dd></div>
              <div><dt className="label">Open tasks</dt><dd className="font-display text-2xl font-bold">{detail.openTasks}</dd></div>
              <div className="col-span-2 flex items-center gap-2 text-xs text-mute">
                <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                {activity.lastLog ? `Last daily log written for ${fmt.day(activity.lastLog)}` : "No daily logs written yet"}
              </div>
            </dl>
          </Panel>

          {manageable && (
            <Panel title="Employment">
              <div className="space-y-3 p-5 text-sm">
                {member.active ? (
                  <>
                    <p className="text-mute">
                      When someone leaves, their login turns off at once. Their {detail.upcomingShifts} upcoming{" "}
                      {detail.upcomingShifts === 1 ? "shift becomes" : "shifts become"} open, and their {detail.openTasks} open{" "}
                      {detail.openTasks === 1 ? "task becomes" : "tasks become"} unassigned. Their logs and records stay.
                    </p>
                    <ConfirmAction action={setStaffActive.bind(null, member.id, false)} label="Mark as left Milestone" tone="danger" confirm={`Mark ${member.firstName} ${member.lastName} as left? Their login turns off and their upcoming shifts open up.`} />
                  </>
                ) : (
                  <>
                    <p className="text-mute">Returning staff are listed again. Their login stays off until you turn it back on.</p>
                    <ConfirmAction action={setStaffActive.bind(null, member.id, true)} label="Mark as returned" />
                  </>
                )}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
