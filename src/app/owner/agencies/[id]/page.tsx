import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { LinkIssuer } from "@/components/app/LinkIssuer";
import { Badge, PageHeader, Panel } from "@/components/app/ui";
import { AgencyFields } from "@/components/owner/AgencyFields";
import { Select } from "@/components/app/Select";
import { BillingBadge } from "@/components/owner/BillingBadge";
import { BILLING_STATUSES, monthlyCents, unitCount } from "@/lib/billing";
import { fmt, money } from "@/lib/format";
import { agencyBilling, listPlans, paymentsFor, unitsFor } from "@/server/billing";
import { addAdminAction, newAdminLinkAction, openSupportAction, recordPaymentAction, setAgencyActiveAction, setAgencyBillingAction, updateAgencyAction } from "@/server/actions/owner";
import { SupportForm } from "@/components/owner/SupportForm";
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
  const [billing, plans, payments] = await Promise.all([agencyBilling(agency.id), listPlans(), paymentsFor(agency.id)]);
  const units = billing.plan ? await unitsFor(agency.id, billing.plan.unit) : 0;
  const today = new Date().toISOString().slice(0, 10);
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
        <div className="space-y-8">
        <Panel title="Profile">
          <div className="p-5">
            <ActionForm action={updateAgencyAction.bind(null, agency.id)} submitLabel="Save profile">
              <AgencyFields initial={agency} />
            </ActionForm>
          </div>
        </Panel>

        <section id="billing" className="scroll-mt-24">
          <Panel title="Plan and billing" action={<BillingBadge status={billing.billing.status} state={billing.state} />}>
            <div className="space-y-6 p-5">
              <p className="text-sm text-mute">
                {billing.plan
                  ? `${billing.plan.name}: ${money(billing.plan.baseCents)} a month${billing.plan.unit !== "none" ? ` plus ${money(billing.plan.unitCents)} for each of ${unitCount(billing.plan.unit, units)}` : ""}, so ${money(monthlyCents(billing.plan, units))} a month at today's numbers.`
                  : "No plan: every feature is on."}
              </p>
              <ActionForm action={setAgencyBillingAction.bind(null, agency.id)} submitLabel="Save plan and status">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5 text-sm font-medium">
                    <span>Plan</span>
                    <Select name="planId" defaultValue={billing.plan?.id ?? ""} options={plans.map(plan => ({ value: plan.id, label: plan.active ? plan.name : `${plan.name} (retired)` }))} aria-label="Plan" />
                  </div>
                  <div className="grid gap-1.5 text-sm font-medium">
                    <span>Status</span>
                    <Select name="status" defaultValue={billing.billing.status} options={Object.entries(BILLING_STATUSES).map(([value, words]) => ({ value, label: words }))} aria-label="Status" />
                  </div>
                  <label className="grid gap-1.5 text-sm font-medium">Trial ends<input type="date" name="trialEndsOn" defaultValue={billing.billing.trialEndsOn ?? ""} className="field" /></label>
                  <label className="grid gap-1.5 text-sm font-medium">Paid until<input type="date" name="paidUntil" defaultValue={billing.billing.paidUntil ?? ""} className="field" /></label>
                  <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Notes<textarea name="notes" rows={2} maxLength={1000} defaultValue={billing.billing.notes} className="field" placeholder="Agreed price, invoice contact, anything to remember" /></label>
                </div>
              </ActionForm>

              <div className="border-t border-line pt-5">
                <p className="mb-3 text-sm font-bold">Record a payment</p>
                <ActionForm action={recordPaymentAction.bind(null, agency.id)} submitLabel="Record payment">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-sm font-medium">Amount ($)<input name="amount" inputMode="decimal" required className="field" /></label>
                    <div className="grid gap-1.5 text-sm font-medium">
                      <span>How</span>
                      <Select name="method" defaultValue="invoice" options={[{ value: "invoice", label: "Invoice" }, { value: "bank transfer", label: "Bank transfer" }, { value: "check", label: "Check" }, { value: "card", label: "Card" }]} aria-label="How it was paid" />
                    </div>
                    <label className="grid gap-1.5 text-sm font-medium">Paid on<input type="date" name="paidOn" required defaultValue={today} className="field" /></label>
                    <label className="grid gap-1.5 text-sm font-medium">Pays up to<input type="date" name="coversUntil" required className="field" /></label>
                    <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Note<input name="note" maxLength={300} className="field" placeholder="Invoice number, period" /></label>
                  </div>
                </ActionForm>
                {payments.length > 0 && (
                  <ul className="mt-5 divide-y divide-line/60 rounded-xl border border-line text-sm">
                    {payments.map(payment => (
                      <li key={payment.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                        <span><span className="font-semibold">{money(payment.amountCents)}</span> <span className="text-mute">by {payment.method}, {fmt.day(payment.paidOn)}{payment.note ? ` · ${payment.note}` : ""}</span></span>
                        <span className="text-xs text-mute">pays up to {fmt.day(payment.coversUntil)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Panel>
        </section>
        </div>

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

          {agency.active && (
            <Panel title="Support visit">
              <div className="space-y-3 p-5 text-sm">
                <p className="text-mute">Opens this agency as an administrator for an hour, to see what they see and help. Its administrators are told who, when and why, and the visit is recorded.</p>
                <SupportForm action={openSupportAction.bind(null, agency.id)} />
              </div>
            </Panel>
          )}

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
