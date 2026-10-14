import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { CalendarClock, CreditCard, Mail, MapPin, Phone, ShieldPlus, Star, UsersRound } from "lucide-react";
import { PrintButton } from "@/components/app/PrintButton";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { ModalForm } from "@/components/app/ModalForm";
import { Badge, Empty, Field, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { daysUntil } from "@/lib/documents";
import { dateKey, fmt } from "@/lib/format";
import { removeContact, saveContact, saveInsurance, setInsuranceActive } from "@/server/actions/care-team";
import { db, schema } from "@/server/db";
import { nextAppointmentFor } from "@/server/queries/appointments";
import { getSettings } from "@/server/settings";

type Person = typeof schema.individuals.$inferSelect;
type Contact = typeof schema.personContacts.$inferSelect;
type Insurance = typeof schema.personInsurance.$inferSelect;

function ContactFields({ contact, roles, prefix }: { contact?: Contact; roles: string[]; prefix: string }) {
  const options = contact && !roles.includes(contact.role) ? [contact.role, ...roles] : roles;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role" htmlFor={`${prefix}-role`}>
          <select id={`${prefix}-role`} name="role" required className="field" defaultValue={contact?.role ?? ""}>
            <option value="" disabled>Choose</option>
            {options.map(role => <option key={role}>{role}</option>)}
          </select>
        </Field>
        <Field label="Name" htmlFor={`${prefix}-name`}><input id={`${prefix}-name`} name="name" required minLength={2} maxLength={120} className="field" defaultValue={contact?.name} /></Field>
      </div>
      <Field label="Organization" htmlFor={`${prefix}-org`}><input id={`${prefix}-org`} name="organization" maxLength={120} className="field" defaultValue={contact?.organization} placeholder="Clinic, agency or pharmacy" /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Phone" htmlFor={`${prefix}-phone`}><input id={`${prefix}-phone`} name="phone" type="tel" maxLength={40} className="field" defaultValue={contact?.phone} /></Field>
        <Field label="Other phone" htmlFor={`${prefix}-alt`}><input id={`${prefix}-alt`} name="altPhone" type="tel" maxLength={40} className="field" defaultValue={contact?.altPhone} /></Field>
        <Field label="Fax" htmlFor={`${prefix}-fax`}><input id={`${prefix}-fax`} name="fax" type="tel" maxLength={40} className="field" defaultValue={contact?.fax} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor={`${prefix}-email`}><input id={`${prefix}-email`} name="email" type="email" maxLength={160} className="field" defaultValue={contact?.email} /></Field>
        <Field label="Address" htmlFor={`${prefix}-address`}><input id={`${prefix}-address`} name="address" maxLength={200} className="field" defaultValue={contact?.address} /></Field>
      </div>
      <Field label="Notes" htmlFor={`${prefix}-notes`}><input id={`${prefix}-notes`} name="notes" maxLength={1000} className="field" defaultValue={contact?.notes} placeholder="Best time to call, fax for orders, etc." /></Field>
      <label className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-sky/50">
        <input type="checkbox" name="isPrimary" defaultChecked={contact?.isPrimary ?? true} className="h-4 w-4 accent-[#1b6fa8]" /> Main contact for this role
      </label>
    </>
  );
}

function InsuranceFields({ insurance, types, prefix }: { insurance?: Insurance; types: string[]; prefix: string }) {
  const options = insurance && !types.includes(insurance.kind) ? [insurance.kind, ...types] : types;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor={`${prefix}-kind`}>
          <select id={`${prefix}-kind`} name="kind" required className="field" defaultValue={insurance?.kind ?? ""}>
            <option value="" disabled>Choose</option>
            {options.map(kind => <option key={kind}>{kind}</option>)}
          </select>
        </Field>
        <Field label="Billing order" htmlFor={`${prefix}-rank`}>
          <select id={`${prefix}-rank`} name="rank" className="field" defaultValue={insurance?.rank ?? "primary"}>
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
            <option value="tertiary">Third</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Insurer" htmlFor={`${prefix}-payer`}><input id={`${prefix}-payer`} name="payer" required maxLength={120} className="field" defaultValue={insurance?.payer} placeholder="BlueCare Tennessee" /></Field>
        <Field label="Plan" htmlFor={`${prefix}-plan`}><input id={`${prefix}-plan`} name="plan" maxLength={120} className="field" defaultValue={insurance?.plan} placeholder="ECF CHOICES" /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Member ID" htmlFor={`${prefix}-member`}><input id={`${prefix}-member`} name="memberId" required maxLength={60} className="field font-mono" defaultValue={insurance?.memberId} /></Field>
        <Field label="Group number" htmlFor={`${prefix}-group`}><input id={`${prefix}-group`} name="groupNumber" maxLength={60} className="field font-mono" defaultValue={insurance?.groupNumber} /></Field>
        <Field label="Member services" htmlFor={`${prefix}-phone`}><input id={`${prefix}-phone`} name="phone" type="tel" maxLength={40} className="field" defaultValue={insurance?.phone} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Policy holder" htmlFor={`${prefix}-holder`}><input id={`${prefix}-holder`} name="policyHolder" maxLength={120} className="field" defaultValue={insurance?.policyHolder} placeholder="Self" /></Field>
        <Field label="Cover starts" htmlFor={`${prefix}-from`}><input id={`${prefix}-from`} name="effectiveFrom" type="date" className="field" defaultValue={insurance?.effectiveFrom ?? ""} /></Field>
        <Field label="Cover ends" htmlFor={`${prefix}-to`} hint="Or the next renewal date."><input id={`${prefix}-to`} name="effectiveTo" type="date" className="field" defaultValue={insurance?.effectiveTo ?? ""} /></Field>
      </div>
      <Field label="Notes" htmlFor={`${prefix}-notes`}><input id={`${prefix}-notes`} name="notes" maxLength={1000} className="field" defaultValue={insurance?.notes} placeholder="Prior authorization needed for imaging" /></Field>
    </>
  );
}

const RANK = { primary: "Primary", secondary: "Secondary", tertiary: "Third" } as const;

/*
 * Everyone around the person and how to reach them, their insurance, and the dates that keep their
 * services running: ISP renewal, annual physical, insurance renewal and the next appointment.
 */
export async function PersonCareTeamTab({ id, person, editor }: { id: string; person: Person; editor: boolean }) {
  const [contacts, insurance, settings, next, keyDocs] = await Promise.all([
    db.select().from(schema.personContacts).where(eq(schema.personContacts.individualId, id)).orderBy(desc(schema.personContacts.isPrimary), asc(schema.personContacts.role), asc(schema.personContacts.name)),
    db.select().from(schema.personInsurance).where(eq(schema.personInsurance.individualId, id)).orderBy(desc(schema.personInsurance.active), asc(schema.personInsurance.rank)),
    getSettings(),
    nextAppointmentFor(id),
    db
      .select({ name: schema.documentTypes.name, expiresOn: schema.documents.expiresOn, id: schema.documents.id })
      .from(schema.documents)
      .innerJoin(schema.documentTypes, eq(schema.documentTypes.id, schema.documents.typeId))
      .where(and(eq(schema.documents.individualId, id), eq(schema.documents.status, "approved"), inArray(schema.documentTypes.name, ["Individual Support Plan (ISP)", "Annual physical", "Behavior support plan", "Nutrition or dietary plan"]))),
  ]);
  const today = dateKey();
  const active = insurance.filter(row => row.active);
  const ended = insurance.filter(row => !row.active);
  const roles = [...new Set(contacts.map(contact => contact.role))];
  const keyDates: { label: string; date: string | null; href?: string; note: string }[] = [
    ...["Individual Support Plan (ISP)", "Annual physical", "Behavior support plan", "Nutrition or dietary plan"].map(name => {
      const doc = keyDocs.find(row => row.name === name);
      return { label: name === "Individual Support Plan (ISP)" ? "ISP renewal" : `${name} renewal`, date: doc?.expiresOn ?? null, href: doc ? `/app/documents/${doc.id}` : `/app/individuals/${id}?tab=documents`, note: doc ? "" : "Not on file" };
    }),
    ...active.filter(row => row.effectiveTo).map(row => ({ label: `${row.kind} renewal`, date: row.effectiveTo, note: row.payer })),
  ];
  const nextVisit = next;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Care team and insurance</h2>
          <p className="text-sm text-mute">Who supports {person.firstName}, how to reach them, and who pays for care.</p>
        </div>
        <PrintButton label="Print contact sheet" />
      </div>

      <Panel title="Key dates">
        <ul className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
          {keyDates.map(item => {
            const left = item.date ? daysUntil(today, item.date) : null;
            const tone = left === null ? "text-mute" : left < 0 ? "text-flag" : left <= 45 ? "text-[#8a5a10]" : "text-ink";
            const body = (
              <>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-mute">{item.label}</span>
                <span className={cn("block font-semibold", tone)}>{item.date ? fmt.dayLong(item.date) : item.note}</span>
                <span className="block text-xs text-mute">{left === null ? "" : left < 0 ? `${-left} days overdue` : `in ${left} days`}{item.date && item.note ? ` · ${item.note}` : ""}</span>
              </>
            );
            return <li key={item.label + item.note} className="bg-white px-5 py-3">{item.href ? <Link href={item.href} className="block hover:text-brand">{body}</Link> : body}</li>;
          })}
          <li className="bg-white px-5 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-mute">Next appointment</span>
            {nextVisit ? (
              <Link href={`/app/appointments/${nextVisit.id}`} className="block font-semibold hover:text-brand">{nextVisit.type} · {fmt.dateTime(nextVisit.scheduledAt)}</Link>
            ) : (
              <span className="block font-semibold text-mute">Nothing booked</span>
            )}
          </li>
        </ul>
      </Panel>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-bold"><CreditCard className="h-5 w-5 text-brand" /> Insurance</h3>
          {editor && (
            <ModalForm action={saveInsurance.bind(null, id, null)} title={`Add insurance for ${person.firstName}`} triggerLabel="Add insurance" triggerTone="ghost" submitLabel="Save insurance">
              <InsuranceFields types={settings.insurance_types} prefix="new-ins" />
            </ModalForm>
          )}
        </div>
        {active.length === 0 ? (
          <Panel><Empty>No insurance recorded. Add Medicaid or TennCare, Medicare or private cover, and upload the card under Documents.</Empty></Panel>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {active.map(row => {
              const left = row.effectiveTo ? daysUntil(today, row.effectiveTo) : null;
              return (
                <article key={row.id} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-deep to-brand p-5 text-white shadow-[var(--shadow-float)]">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">{row.kind}</p>
                      <p className="mt-1 font-display text-lg font-bold leading-tight">{row.payer}</p>
                      {row.plan && <p className="text-sm text-white/80">{row.plan}</p>}
                    </div>
                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold">{RANK[row.rank]}</span>
                  </div>
                  <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-[10px] uppercase tracking-wider text-white/60">Member ID</dt><dd className="font-mono font-semibold">{row.memberId}</dd></div>
                    <div><dt className="text-[10px] uppercase tracking-wider text-white/60">Group</dt><dd className="font-mono">{row.groupNumber || "—"}</dd></div>
                    <div><dt className="text-[10px] uppercase tracking-wider text-white/60">Holder</dt><dd>{row.policyHolder || "Self"}</dd></div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-white/60">Cover</dt>
                      <dd className={cn(left !== null && left < 0 && "font-bold text-accent")}>{row.effectiveFrom ? fmt.day(row.effectiveFrom) : "?"} – {row.effectiveTo ? fmt.day(row.effectiveTo) : "ongoing"}</dd>
                    </div>
                  </dl>
                  {left !== null && left <= 45 && <p className="mt-3 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold">{left < 0 ? "Coverage has ended. Check renewal." : `Renews in ${left} days.`}</p>}
                  {row.notes && <p className="mt-3 text-xs text-white/80">{row.notes}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/15 pt-3 text-xs">
                    {row.phone && <a href={`tel:${row.phone}`} className="inline-flex items-center gap-1 font-semibold text-white"><Phone className="h-3.5 w-3.5" /> {row.phone}</a>}
                    {editor && (
                      <span className="ml-auto flex items-center gap-2 [&_button]:border-white/30 [&_button]:bg-white/10 [&_button]:text-white">
                        <ModalForm action={saveInsurance.bind(null, id, row.id)} title="Edit insurance" triggerLabel="Edit" triggerIcon="pencil" triggerTone="ghost" submitLabel="Save">
                          <InsuranceFields insurance={row} types={settings.insurance_types} prefix={`ins-${row.id.slice(0, 8)}`} />
                        </ModalForm>
                        <ConfirmAction action={setInsuranceActive.bind(null, id, row.id, false)} label="End cover" confirm={`Mark ${row.payer} as ended? It stays in the history.`} />
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {ended.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-xs font-semibold text-mute">Ended cover ({ended.length})</summary>
            <ul className="mt-2 space-y-1">
              {ended.map(row => (
                <li key={row.id} className="flex items-center gap-2 text-mute">
                  <ShieldPlus className="h-3.5 w-3.5" /> {row.kind} · {row.payer} · {row.memberId}
                  {editor && <ConfirmAction action={setInsuranceActive.bind(null, id, row.id, true)} label="Restore" />}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-bold"><UsersRound className="h-5 w-5 text-brand" /> Care team</h3>
          {editor && (
            <ModalForm action={saveContact.bind(null, id, null)} title={`Add to ${person.firstName}'s care team`} triggerLabel="Add contact" triggerTone="ghost" submitLabel="Save contact">
              <ContactFields roles={settings.care_team_roles} prefix="new-contact" />
            </ModalForm>
          )}
        </div>
        {contacts.length === 0 ? (
          <Panel><Empty>No contacts yet. Add the support coordinator, doctors, nutritionist, pharmacy and family.</Empty></Panel>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {roles.map(role => (
              <Panel key={role} title={role}>
                <ul className="divide-y divide-line/60">
                  {contacts.filter(contact => contact.role === role).map(contact => (
                    <li key={contact.id} className="px-5 py-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">
                          {contact.name}
                          {contact.isPrimary && <Star className="ml-1 inline h-3.5 w-3.5 fill-accent text-accent" aria-label="Main contact" />}
                          {contact.organization && <span className="block text-xs font-normal text-mute">{contact.organization}</span>}
                        </p>
                        {editor && (
                          <span className="flex shrink-0 items-center gap-1.5">
                            <ModalForm action={saveContact.bind(null, id, contact.id)} title="Edit contact" triggerLabel="Edit" triggerIcon="pencil" triggerTone="ghost" submitLabel="Save">
                              <ContactFields contact={contact} roles={settings.care_team_roles} prefix={`contact-${contact.id.slice(0, 8)}`} />
                            </ModalForm>
                            <ConfirmAction action={removeContact.bind(null, id, contact.id)} label="Remove" confirm={`Remove ${contact.name} from the care team?`} />
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {contact.phone && <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 font-semibold text-brand"><Phone className="h-3.5 w-3.5" /> {contact.phone}</a>}
                        {contact.altPhone && <a href={`tel:${contact.altPhone}`} className="inline-flex items-center gap-1 text-brand"><Phone className="h-3.5 w-3.5" /> {contact.altPhone}</a>}
                        {contact.email && <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 text-brand"><Mail className="h-3.5 w-3.5" /> {contact.email}</a>}
                        {contact.fax && <span className="text-mute">Fax {contact.fax}</span>}
                        {contact.address && <span className="inline-flex items-center gap-1 text-mute"><MapPin className="h-3.5 w-3.5" /> {contact.address}</span>}
                      </div>
                      {contact.notes && <p className="mt-1 text-xs text-mute">{contact.notes}</p>}
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        )}
      </section>
      <p className="flex items-center gap-1.5 text-xs text-mute"><CalendarClock className="h-3.5 w-3.5" /> Insurance renewals within 45 days are flagged here, and coordinators are reminded before cover ends.</p>
      {!editor && <Badge tone="neutral">Coordinators and nurses keep this up to date.</Badge>}
    </div>
  );
}
