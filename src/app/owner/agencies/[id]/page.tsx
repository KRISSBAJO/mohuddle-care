import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { LinkIssuer } from "@/components/app/LinkIssuer";
import { Badge, PageHeader, Panel } from "@/components/app/ui";
import { AgencyFields } from "@/components/owner/AgencyFields";
import { fmt } from "@/lib/format";
import { addAdminAction, newAdminLinkAction, setAgencyActiveAction, updateAgencyAction } from "@/server/actions/owner";
import { requireOwner } from "@/server/guard";
import { ownerActionWords } from "@/lib/owner-events";
import { agencyDetail, ownerEvents } from "@/server/owner";

export const metadata = { title: "Agency" };

/* One agency: its profile, whether it is on, and its administrators. */
export default async function AgencyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const detail = await agencyDetail(id);
  if (!detail) notFound();
  const { agency, admins } = detail;
  const history = (await ownerEvents(agency.id)).slice(0, 8);
  return (
    <div className="space-y-8">
      <Link href="/owner" className="inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> All agencies</Link>
      <PageHeader
        eyebrow={`${agency.slug}.mohuddle.com · since ${fmt.day(agency.createdAt.toISOString().slice(0, 10))}`}
        title={agency.name}
        description={agency.legalName}
        action={agency.active ? <Badge tone="good">Active</Badge> : <Badge tone="neutral">Turned off</Badge>}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel title="Profile">
          <div className="p-5">
            <ActionForm action={updateAgencyAction.bind(null, agency.id)} submitLabel="Save profile">
              <AgencyFields initial={agency} />
            </ActionForm>
          </div>
        </Panel>

        <div className="space-y-8">
          <Panel title="Administrators">
            <ul className="divide-y divide-line/60">
              {admins.map(admin => (
                <li key={admin.id} className="space-y-2.5 px-5 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{admin.name}</span>
                      <span className="block truncate text-xs text-mute">{admin.email}</span>
                    </span>
                    {!admin.active ? <Badge tone="neutral">Off</Badge> : admin.hasPassword ? <Badge tone="good">Can sign in</Badge> : <Badge tone="warn">Invited</Badge>}
                  </div>
                  {admin.active && (
                    <LinkIssuer action={newAdminLinkAction.bind(null, agency.id, admin.id)} label={admin.hasPassword ? "New password link" : "New setup link"} />
                  )}
                </li>
              ))}
              {admins.length === 0 && <li className="px-5 py-4 text-sm text-mute">No administrators yet.</li>}
            </ul>
            <div className="border-t border-line p-5">
              <LinkIssuer key={admins.length} action={addAdminAction.bind(null, agency.id)} label="Add administrator">
                <label className="grid gap-1.5 text-sm font-medium">Name<input name="adminName" required maxLength={120} className="field" autoComplete="off" /></label>
                <label className="grid gap-1.5 text-sm font-medium">Email<input name="adminEmail" type="email" required maxLength={200} className="field" autoComplete="off" /></label>
              </LinkIssuer>
            </div>
          </Panel>

          <Panel title="Recent owner activity" action={<Link href="/owner/activity" className="text-xs font-semibold text-brand">All activity</Link>}>
            {history.length === 0 ? (
              <p className="px-5 py-4 text-sm text-mute">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-line/60">
                {history.map(event => (
                  <li key={event.id} className="px-5 py-2.5 text-sm">
                    <span className="font-semibold">{ownerActionWords(event.action)}</span>
                    <span className="block text-xs text-mute">{fmt.dateTime(event.at)} · {event.ownerName.split(" (")[0]}{event.detail ? ` · ${event.detail}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={agency.active ? "Turn this agency off" : "Turn this agency back on"}>
            <div className="space-y-3 p-5 text-sm">
              <p className="text-mute">
                {agency.active
                  ? "Everyone there is signed out at once and nobody can sign in. Reminders stop. Every record stays, and turning it back on restores everything."
                  : "Its people can sign in again, and reminders start again."}
              </p>
              <ConfirmAction
                action={setAgencyActiveAction.bind(null, agency.id, !agency.active)}
                label={agency.active ? "Turn off" : "Turn back on"}
                confirm={agency.active ? `Turn off ${agency.name}? Everyone there is signed out now.` : undefined}
                tone={agency.active ? "danger" : "brand"}
              />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
