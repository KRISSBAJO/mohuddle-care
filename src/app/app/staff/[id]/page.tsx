import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { LinkIssuer } from "@/components/app/LinkIssuer";
import { Avatar, Badge, Empty, Field, PageHeader, Panel } from "@/components/app/ui";
import { defaultLoginRole, loginRoleLabel, mayManageLogin, rolesActorMayGrant } from "@/lib/account-policy";
import { dateKey, daysBetween, fmt, initials, label, labels } from "@/lib/format";
import { createLogin, issueResetLink, setLoginActive, setLoginRole } from "@/server/actions/accounts";
import { addCredential } from "@/server/actions/hub";
import { removeCredential, setStaffActive, updateStaff } from "@/server/actions/editing";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { listHomes, staffDetail } from "@/server/queries/hub";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Staff member" };

export default async function StaffMemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { saved } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, homes, settings] = await Promise.all([staffDetail(id), listHomes(), getSettings()]);
  if (!detail) notFound();
  const { member, login, credentials } = detail;
  const manager = canManage(user);
  const self = user.staffId === member.id;
  const manageable = manager && !self && (!login || mayManageLogin(user, login));
  const grantable = rolesActorMayGrant(user);
  const today = dateKey();

  return (
    <div className="max-w-4xl">
      <Link href="/app/staff" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All staff
      </Link>
      <PageHeader
        eyebrow={label("staffRole", member.role)}
        title={`${member.firstName} ${member.lastName}`}
        description={[detail.home ? `Based at ${detail.home.name}` : "Floating or office", member.hiredAt ? `Hired ${fmt.day(member.hiredAt)}` : null, member.email].filter(Boolean).join(" · ")}
        action={
          <div className="flex items-center gap-2">
            <Avatar initials={initials(member.firstName, member.lastName)} size="lg" />
            {!member.active && <Badge tone="neutral">Left Milestone</Badge>}
          </div>
        }
      />
      {saved && <p className="mb-6 rounded-xl bg-sage-soft px-4 py-3 text-sm font-medium text-sage">Changes saved.</p>}

      <div className="grid gap-6 lg:grid-cols-2">
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
                  <Badge tone="brand">{login.role}</Badge>
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
                    <ConfirmAction action={setLoginRole.bind(null, login.id)} label="Change access" confirm="Change this person's access? They will be signed out everywhere.">
                      <Field label="Access level" htmlFor="change-role">
                        <select id="change-role" name="role" className="field" defaultValue={login.role}>
                          {grantable.map(role => <option key={role} value={role}>{loginRoleLabel[role]}</option>)}
                        </select>
                      </Field>
                    </ConfirmAction>
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

        <Panel title="Credentials">
          {credentials.length === 0 ? (
            <Empty>No credentials recorded.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {credentials.map(cred => {
                const days = cred.expiresAt ? daysBetween(today, cred.expiresAt) : null;
                const tone = days === null ? "neutral" : days < 0 ? "bad" : days <= settings.credential_warning_days ? "warn" : "good";
                return (
                  <li key={cred.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <p className="font-semibold">{cred.type}</p>
                      <p className="text-xs text-mute">
                        {cred.issuedAt ? `Issued ${fmt.day(cred.issuedAt)}` : "Issue date not recorded"}
                        {cred.note && ` · ${cred.note}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Badge tone={tone}>{cred.expiresAt ? (days! < 0 ? `Expired ${fmt.day(cred.expiresAt)}` : `Expires ${fmt.day(cred.expiresAt)}`) : "No expiry"}</Badge>
                      {manager && <ConfirmAction action={removeCredential.bind(null, cred.id, member.id)} label="Remove" confirm={`Remove ${cred.type}? Record the renewed one first if it was renewed.`} className="justify-items-end" />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {manager && member.active && (
            <details className="border-t border-line">
              <summary className="cursor-pointer px-5 py-3 text-xs font-semibold text-brand">Record a credential or renewal</summary>
              <div className="px-5 pb-5">
                <ActionForm action={addCredential} submitLabel="Save credential">
                  <input type="hidden" name="staffId" value={member.id} />
                  <Field label="Credential" htmlFor="cred-type">
                    <select id="cred-type" name="type" className="field">{settings.credential_types.map(type => <option key={type} value={type}>{type}</option>)}</select>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Issued" htmlFor="cred-issued"><input id="cred-issued" name="issuedAt" type="date" className="field" /></Field>
                    <Field label="Expires" htmlFor="cred-expires"><input id="cred-expires" name="expiresAt" type="date" className="field" /></Field>
                  </div>
                  <Field label="Note" htmlFor="cred-note"><input id="cred-note" name="note" className="field" placeholder="Certificate number, provider" /></Field>
                </ActionForm>
              </div>
            </details>
          )}
        </Panel>
      </div>

      {manager && (
        <Panel title="Details" className="mt-6">
          <div className="p-5">
            <ActionForm action={updateStaff.bind(null, member.id)} submitLabel="Save details">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" htmlFor="staff-first"><input id="staff-first" name="firstName" required className="field" defaultValue={member.firstName} /></Field>
                <Field label="Last name" htmlFor="staff-last"><input id="staff-last" name="lastName" required className="field" defaultValue={member.lastName} /></Field>
                <Field label="Job" htmlFor="staff-role">
                  <select id="staff-role" name="role" className="field" defaultValue={member.role}>{Object.entries(labels.staffRole).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
                </Field>
                <Field label="Based at" htmlFor="staff-home">
                  <select id="staff-home" name="homeId" className="field" defaultValue={member.homeId ?? ""}>
                    <option value="">Floating or office</option>
                    {homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}
                  </select>
                </Field>
                <Field label="Email" htmlFor="staff-email" hint={login ? "This is also their sign-in email." : undefined}><input id="staff-email" name="email" type="email" required className="field" defaultValue={member.email} /></Field>
                <Field label="Phone" htmlFor="staff-phone"><input id="staff-phone" name="phone" type="tel" className="field" defaultValue={member.phone} /></Field>
                <Field label="Hired" htmlFor="staff-hired"><input id="staff-hired" name="hiredAt" type="date" className="field" defaultValue={member.hiredAt ?? ""} /></Field>
              </div>
            </ActionForm>
          </div>
        </Panel>
      )}

      {manageable && (
        <Panel title="Employment" className="mt-6">
          <div className="space-y-3 p-5 text-sm">
            {member.active ? (
              <>
                <p className="text-mute">
                  When someone leaves, their login is turned off at once. Their {detail.upcomingShifts} upcoming{" "}
                  {detail.upcomingShifts === 1 ? "shift becomes" : "shifts become"} open for someone else, and their {detail.openTasks} open{" "}
                  {detail.openTasks === 1 ? "task becomes" : "tasks become"} unassigned. Their logs and records stay.
                </p>
                <ConfirmAction action={setStaffActive.bind(null, member.id, false)} label="Mark as left Milestone" tone="danger" confirm={`Mark ${member.firstName} ${member.lastName} as left? Their login turns off and their upcoming shifts open up.`} />
              </>
            ) : (
              <>
                <p className="text-mute">Returning staff are listed again. Their login stays off until you turn it back on above.</p>
                <ConfirmAction action={setStaffActive.bind(null, member.id, true)} label="Mark as returned" />
              </>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
