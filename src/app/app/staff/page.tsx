import { ActionForm } from "@/components/app/ActionForm";
import { Avatar, Badge, Empty, Field, PageHeader, Panel } from "@/components/app/ui";
import { dateKey, daysBetween, fmt, initials, label, labels } from "@/lib/format";
import { addCredential, createStaff } from "@/server/actions/hub";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { listHomes, staffWithCredentials } from "@/server/queries/hub";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const user = await requireUser();
  const manager = canManage(user);
  const [people, homes, settings] = await Promise.all([staffWithCredentials(), listHomes(), getSettings()]);
  const today = dateKey();

  return (
    <>
      <PageHeader eyebrow="Staff" title={`${people.length} team members`} description={`Credentials turn amber ${settings.credential_warning_days} days before they expire and red once they have.`} />
      <Panel>
        {people.length === 0 ? <Empty>No staff yet.</Empty> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th>Home</th><th>Credentials</th></tr></thead>
            <tbody>
              {people.map(person => (
                <tr key={person.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar initials={initials(person.firstName, person.lastName)} size="sm" />
                      <div><p className="font-semibold">{person.firstName} {person.lastName}</p><p className="text-xs text-mute">{person.email}{person.phone && ` · ${person.phone}`}</p></div>
                    </div>
                  </td>
                  <td>{label("staffRole", person.role)}</td>
                  <td className="text-mute">{person.home ?? "—"}</td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {person.credentials.length === 0 && <span className="text-xs text-dim">None recorded</span>}
                      {person.credentials.map(cred => {
                        const days = cred.expiresAt ? daysBetween(today, cred.expiresAt) : null;
                        const tone = days === null ? "neutral" : days < 0 ? "bad" : days <= settings.credential_warning_days ? "warn" : "good";
                        return <Badge key={cred.id} tone={tone} className="font-medium">{cred.type}{cred.expiresAt ? ` · ${fmt.day(cred.expiresAt)}` : ""}</Badge>;
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {manager && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Add a team member">
            <div className="p-5">
              <ActionForm action={createStaff} submitLabel="Add team member">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="First name" htmlFor="staff-first"><input id="staff-first" name="firstName" required className="field" /></Field>
                  <Field label="Last name" htmlFor="staff-last"><input id="staff-last" name="lastName" required className="field" /></Field>
                  <Field label="Role" htmlFor="staff-role"><select id="staff-role" name="role" className="field">{Object.entries(labels.staffRole).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field>
                  <Field label="Home" htmlFor="staff-home"><select id="staff-home" name="homeId" className="field" defaultValue=""><option value="">Floating or office</option>{homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}</select></Field>
                  <Field label="Email" htmlFor="staff-email"><input id="staff-email" name="email" type="email" required className="field" /></Field>
                  <Field label="Phone" htmlFor="staff-phone"><input id="staff-phone" name="phone" type="tel" className="field" /></Field>
                  <Field label="Hired" htmlFor="staff-hired"><input id="staff-hired" name="hiredAt" type="date" className="field" /></Field>
                </div>
              </ActionForm>
            </div>
          </Panel>
          <Panel title="Record a credential">
            <div className="p-5">
              <ActionForm action={addCredential} submitLabel="Save credential">
                <Field label="Team member" htmlFor="cred-staff"><select id="cred-staff" name="staffId" required className="field">{people.map(person => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}</select></Field>
                <Field label="Credential" htmlFor="cred-type"><select id="cred-type" name="type" className="field">{settings.credential_types.map(type => <option key={type} value={type}>{type}</option>)}</select></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Issued" htmlFor="cred-issued"><input id="cred-issued" name="issuedAt" type="date" className="field" /></Field>
                  <Field label="Expires" htmlFor="cred-expires"><input id="cred-expires" name="expiresAt" type="date" className="field" /></Field>
                </div>
                <Field label="Note" htmlFor="cred-note"><input id="cred-note" name="note" className="field" placeholder="Certificate number, provider" /></Field>
              </ActionForm>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
