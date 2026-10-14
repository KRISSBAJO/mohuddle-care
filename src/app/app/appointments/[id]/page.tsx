import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock, ExternalLink, MapPin, Phone, Pill, Repeat, ShieldAlert, Stethoscope, UserRound } from "lucide-react";
import { AppointmentFields } from "@/components/appointments/AppointmentParts";
import { ActionForm } from "@/components/app/ActionForm";
import { ModalForm } from "@/components/app/ModalForm";
import { PrintButton } from "@/components/app/PrintButton";
import { Avatar, Badge, Field, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { followUpState, visitState, VISIT_STATE } from "@/lib/appointments";
import { addDays, dateKey, fmt, initials } from "@/lib/format";
import { closeAppointment, documentAppointment, updateAppointment, bookAppointment } from "@/server/actions/appointments";
import { canManage } from "@/server/auth";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { appointmentDetail } from "@/server/queries/appointments";
import { listStaff } from "@/server/queries/hub";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Appointment" };

function Detail({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-dim" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{label}</p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

export default async function AppointmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ booked?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { booked } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, staff, settings, now] = await Promise.all([appointmentDetail(id), listStaff(), getSettings(), requestTime()]);
  if (!detail) notFound();
  const { appointment: a, person } = detail;
  const today = dateKey(new Date(now));
  const state = visitState(a, now, settings.appointment_document_hours, today, dateKey);
  const follow = followUpState(a, today);
  const badge = VISIT_STATE[state];
  const mayChange = canManage(user) || user.role === "nurse" || a.createdBy === user.id;
  const open = a.status === "scheduled";
  const canDocument = open && a.scheduledAt.getTime() <= now + 3_600_000;
  const end = new Date(a.scheduledAt.getTime() + a.durationMinutes * 60_000);
  const mapLink = a.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([a.clinic, a.address].filter(Boolean).join(", "))}` : null;

  return (
    <div className="max-w-6xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/app/individuals/${person.id}?tab=appointments`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> {person.firstName}&apos;s appointments
        </Link>
        <div className="flex gap-2">
          <Link href="/app/appointments" className="btn-ghost btn-sm">All appointments</Link>
          <PrintButton label="Print visit sheet" />
        </div>
      </div>

      {booked && (
        <p className="no-print mb-5 rounded-xl bg-sage-soft px-4 py-3 text-sm font-medium text-sage">
          Booked.{a.escortStaffId ? " The escort, the home manager and the team have been told." : " Choose who goes with them so they get reminders."}
        </p>
      )}

      <section className="card mb-6 overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-plum-soft text-plum"><Stethoscope className="h-6 w-6" /></span>
            <div>
              <p className="eyebrow">{a.type}</p>
              <h1 className="mt-1 flex flex-wrap items-center gap-2.5 text-2xl font-bold sm:text-3xl">
                {a.provider || a.type}
                <Badge tone={badge.tone}>{badge.text}</Badge>
                {follow === "to_book" && <Badge tone="warn">Follow-up to book</Badge>}
                {follow === "overdue" && <Badge tone="bad">Follow-up overdue</Badge>}
              </h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mute">
                <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /><span className="font-semibold text-ink">{fmt.dayLong(dateKey(a.scheduledAt))}</span>, {fmt.time(a.scheduledAt)} to {fmt.time(end)}</span>
                <Link href={`/app/individuals/${person.id}`} className="inline-flex items-center gap-1.5 font-semibold text-ink hover:text-brand">
                  <Avatar initials={initials(person.firstName, person.lastName)} size="sm" /> {person.firstName} {person.lastName}
                </Link>
              </p>
            </div>
          </div>
          {mayChange && open && (
            <div className="no-print flex flex-wrap gap-2">
              <ModalForm action={updateAppointment.bind(null, a.id)} title="Change or reschedule" description="A new time or escort is sent to the team again." triggerLabel="Change" triggerIcon="pencil" triggerTone="ghost" submitLabel="Save changes">
                <AppointmentFields types={settings.appointment_types} staff={staff} appointment={a} prefix="edit-appt" />
              </ModalForm>
              <ModalForm action={closeAppointment.bind(null, a.id, "cancelled")} title="Cancel this appointment" triggerLabel="Cancel" triggerIcon="none" triggerTone="ghost" submitLabel="Cancel appointment">
                <Field label="Why was it cancelled?" htmlFor="cancel-reason" hint="For example the clinic rescheduled, or the person was unwell.">
                  <textarea id="cancel-reason" name="reason" rows={3} required minLength={3} maxLength={500} className="field" />
                </Field>
              </ModalForm>
              {a.scheduledAt.getTime() < now && (
                <ModalForm action={closeAppointment.bind(null, a.id, "missed")} title="Mark as missed" triggerLabel="Missed" triggerIcon="none" triggerTone="ghost" submitLabel="Mark missed">
                  <Field label="Why was it missed?" htmlFor="missed-reason">
                    <textarea id="missed-reason" name="reason" rows={3} required minLength={3} maxLength={500} className="field" />
                  </Field>
                </ModalForm>
              )}
            </div>
          )}
        </div>
        {person.allergies && (
          <p className="flex items-center gap-2 border-t border-line bg-flag-soft px-6 py-2.5 text-sm font-semibold text-flag"><ShieldAlert className="h-4 w-4" /> Allergies: {person.allergies}</p>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {a.status === "completed" && (
            <Panel title="What happened at the visit">
              <div className="space-y-4 p-5 text-sm">
                {a.seenBy && <p><span className="text-mute">Seen by </span><span className="font-semibold">{a.seenBy}</span></p>}
                <p className="whitespace-pre-line leading-relaxed">{a.summary}</p>
                {a.diagnosisChanges && (
                  <div className="rounded-xl bg-sky/50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-deep">Diagnosis or condition changes</p>
                    <p className="whitespace-pre-line">{a.diagnosisChanges}</p>
                  </div>
                )}
                {a.medicationChanges && (
                  <div className="rounded-xl bg-plum-soft px-4 py-3">
                    <p className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-plum">
                      <span className="inline-flex items-center gap-1.5"><Pill className="h-3.5 w-3.5" /> Medication changes</span>
                      {canManage(user) && <Link href={`/app/individuals/${person.id}?tab=medications`} className="normal-case tracking-normal underline">Update orders</Link>}
                    </p>
                    <p className="whitespace-pre-line">{a.medicationChanges}</p>
                  </div>
                )}
                {a.orders && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Labs, referrals and orders</p>
                    <p className="whitespace-pre-line">{a.orders}</p>
                  </div>
                )}
                <p className="border-t border-line pt-3 text-xs text-mute">Documented by {detail.documentedBy ?? "staff"} on {a.documentedAt ? fmt.dateTime(a.documentedAt) : ""}.</p>
              </div>
            </Panel>
          )}

          {(a.status === "cancelled" || a.status === "missed") && (
            <Panel title={a.status === "cancelled" ? "Cancelled" : "Missed"}>
              <p className="p-5 text-sm">{a.statusReason}</p>
            </Panel>
          )}

          {canDocument && (
            <Panel title="Document the visit">
              <div className="no-print p-5">
                <p className="mb-4 text-sm text-mute">
                  Write what happened while it is fresh. Due within {settings.appointment_document_hours} hours of the appointment. Medication changes are sent to the nurse and coordinators straight away.
                </p>
                <ActionForm action={documentAppointment.bind(null, a.id)} submitLabel="Save visit notes">
                  <Field label="Seen by" htmlFor="visit-seen"><input id="visit-seen" name="seenBy" maxLength={120} className="field" defaultValue={a.provider} /></Field>
                  <Field label="What happened" htmlFor="visit-summary" hint="What was checked, what the clinician said, and how the person found it.">
                    <textarea id="visit-summary" name="summary" rows={5} required minLength={10} maxLength={5000} className="field" />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Diagnosis or condition changes" htmlFor="visit-dx"><textarea id="visit-dx" name="diagnosisChanges" rows={3} maxLength={2000} className="field" placeholder="None" /></Field>
                    <Field label="Medication changes" htmlFor="visit-meds" hint="New, stopped or changed doses."><textarea id="visit-meds" name="medicationChanges" rows={3} maxLength={2000} className="field" placeholder="None" /></Field>
                  </div>
                  <Field label="Labs, referrals and orders" htmlFor="visit-orders"><textarea id="visit-orders" name="orders" rows={2} maxLength={2000} className="field" placeholder="Blood work next week at the same clinic." /></Field>
                  <fieldset className="rounded-xl border border-line p-4">
                    <label className="flex items-center gap-2.5 text-sm font-semibold">
                      <input type="checkbox" name="followUpNeeded" className="h-4 w-4 accent-[#1b6fa8]" /> The clinician wants a follow-up
                    </label>
                    <div className="mt-3 grid gap-4 sm:grid-cols-3">
                      <Field label="Needed by" htmlFor="visit-followby"><input id="visit-followby" name="followUpBy" type="date" className="field" defaultValue={addDays(today, 28)} /></Field>
                      <Field label="Already booked for" htmlFor="visit-nextdate" hint="Leave blank to book later."><input id="visit-nextdate" name="nextDate" type="date" className="field" /></Field>
                      <Field label="At" htmlFor="visit-nexttime"><input id="visit-nexttime" name="nextTime" type="time" className="field" /></Field>
                    </div>
                    <div className="mt-3">
                      <Field label="Follow-up notes" htmlFor="visit-follownotes"><input id="visit-follownotes" name="followUpNotes" maxLength={1000} className="field" placeholder="Recheck the knee in four weeks." /></Field>
                    </div>
                  </fieldset>
                </ActionForm>
              </div>
            </Panel>
          )}

          <Panel title="Visit details">
            <div className="grid gap-5 p-5 sm:grid-cols-2">
              <Detail icon={MapPin} label="Where">
                <p className="font-semibold">{a.clinic || "Clinic not set"}</p>
                {a.address && <p className="text-mute">{a.address}</p>}
                {mapLink && <a href={mapLink} target="_blank" rel="noreferrer" className="no-print inline-flex items-center gap-1 text-xs font-semibold text-brand">Map <ExternalLink className="h-3 w-3" /></a>}
              </Detail>
              <Detail icon={Phone} label="Clinic phone">{a.phone ? <a href={`tel:${a.phone}`} className="font-semibold text-brand">{a.phone}</a> : <span className="text-mute">Not set</span>}</Detail>
              <Detail icon={UserRound} label="Going with them">
                {detail.escort ? (
                  <>
                    <Link href={`/app/staff/${a.escortStaffId}`} className="font-semibold hover:text-brand">{detail.escort}</Link>
                    {detail.escortPhone && <a href={`tel:${detail.escortPhone}`} className="ml-2 text-brand">{detail.escortPhone}</a>}
                  </>
                ) : (
                  <span className="font-semibold text-[#8a5a10]">Not decided yet</span>
                )}
              </Detail>
              <Detail icon={Clock} label="Transport">{a.transport || <span className="text-mute">Not set</span>}</Detail>
              <div className="sm:col-span-2">
                <Detail icon={Stethoscope} label="Reason">{a.reason ? <p className="whitespace-pre-line">{a.reason}</p> : <span className="text-mute">Not given</span>}</Detail>
              </div>
              {a.prep && (
                <div className="sm:col-span-2 rounded-xl bg-accent-soft/60 px-4 py-3 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8a5a10]">Before the visit</p>
                  <p className="whitespace-pre-line">{a.prep}</p>
                </div>
              )}
            </div>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Follow-up">
            <div className="space-y-3 p-5 text-sm">
              {detail.followUpOf && (
                <p>
                  Follow-up from{" "}
                  <Link href={`/app/appointments/${detail.followUpOf.id}`} className="font-semibold text-brand">{detail.followUpOf.type}, {fmt.day(detail.followUpOf.scheduledAt)}</Link>
                </p>
              )}
              {detail.next ? (
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-sage" /> Next visit booked:{" "}
                  <Link href={`/app/appointments/${detail.next.id}`} className="font-semibold text-brand">{fmt.dayLong(dateKey(detail.next.scheduledAt))}</Link>
                </p>
              ) : a.followUpNeeded ? (
                <>
                  <p className={cn("flex items-center gap-2 font-semibold", follow === "overdue" ? "text-flag" : "text-[#8a5a10]")}>
                    <Repeat className="h-4 w-4" /> Follow-up needed{a.followUpBy ? ` by ${fmt.dayLong(a.followUpBy)}` : ""}
                  </p>
                  {a.followUpNotes && <p className="text-mute">{a.followUpNotes}</p>}
                  <ModalForm action={bookAppointment} title="Book the follow-up" triggerLabel="Book follow-up" submitLabel="Book appointment">
                    <AppointmentFields
                      types={settings.appointment_types}
                      staff={staff}
                      appointment={{ ...a, scheduledAt: undefined, reason: a.followUpNotes || `Follow-up from ${fmt.day(a.scheduledAt)}`, prep: "" }}
                      prefix="follow"
                      defaults={{ individualId: person.id, followUpOf: a.id, date: a.followUpBy ?? addDays(today, 14) }}
                    />
                  </ModalForm>
                </>
              ) : (
                !detail.followUpOf && <p className="text-mute">{a.status === "completed" ? "No follow-up was asked for." : "Recorded when the visit is documented."}</p>
              )}
            </div>
          </Panel>

          <Panel title="Take to the visit">
            <div className="space-y-3 p-5 text-sm">
              <p><span className="text-mute">Date of birth: </span>{person.dob ? fmt.dayLong(person.dob) : "Not recorded"}</p>
              <p><span className="text-mute">Diagnoses: </span>{person.diagnoses || "None recorded"}</p>
              <p className={person.allergies ? "font-semibold text-flag" : ""}><span className="font-normal text-mute">Allergies: </span>{person.allergies || "None known"}</p>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Current medications</p>
                {detail.meds.length === 0 ? (
                  <p className="text-mute">None</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {detail.meds.map(med => (
                      <li key={med.id}><span className="font-semibold">{med.name}</span> {med.dose}, {med.route}, {med.times.join(", ")}</li>
                    ))}
                  </ul>
                )}
              </div>
              {(person.guardianName || person.emergencyContact) && (
                <p><span className="text-mute">Guardian or contact: </span>{person.guardianName || person.emergencyContact} {person.guardianPhone || person.emergencyPhone}</p>
              )}
            </div>
          </Panel>

          {detail.history.length > 0 && (
            <Panel title={`Earlier ${a.type.toLowerCase()} visits`}>
              <ul className="divide-y divide-line/60">
                {detail.history.map(item => (
                  <li key={item.id}>
                    <Link href={`/app/appointments/${item.id}`} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm hover:bg-panel/50">
                      <span>{fmt.dayLong(dateKey(item.scheduledAt))}{item.provider ? ` · ${item.provider}` : ""}</span>
                      <Badge tone={item.status === "completed" ? "good" : item.status === "scheduled" ? "brand" : "neutral"}>{item.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <p className="px-1 text-xs text-dim">Booked by {detail.createdBy ?? "staff"} on {fmt.dateTime(a.createdAt)}.</p>
        </aside>
      </div>
    </div>
  );
}
