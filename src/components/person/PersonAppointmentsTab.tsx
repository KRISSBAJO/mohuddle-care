import { AppointmentFields, AppointmentList } from "@/components/appointments/AppointmentParts";
import { ModalForm } from "@/components/app/ModalForm";
import { Panel } from "@/components/app/ui";
import { addDays, dateKey } from "@/lib/format";
import { bookAppointment } from "@/server/actions/appointments";
import { requestTime } from "@/server/clock";
import type { schema } from "@/server/db";
import { listAppointments } from "@/server/queries/appointments";
import { listStaff } from "@/server/queries/hub";
import { getSettings } from "@/server/settings";

type Person = typeof schema.individuals.$inferSelect;

/* One person's appointments: what needs documenting, what is booked, follow-ups to book, and the history. */
export async function PersonAppointmentsTab({ id, person }: { id: string; person: Person }) {
  const [toDocument, upcoming, followups, past, staff, settings, now] = await Promise.all([
    listAppointments({ view: "document", personId: id }),
    listAppointments({ view: "upcoming", personId: id }),
    listAppointments({ view: "followup", personId: id }),
    listAppointments({ view: "past", personId: id, limit: 30 }),
    listStaff(),
    getSettings(),
    requestTime(),
  ]);
  const hours = settings.appointment_document_hours;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Appointments for {person.firstName}</h2>
          <p className="text-sm text-mute">Doctor, dentist, therapy and lab visits, with what was said and what happens next.</p>
        </div>
        {person.active && (
          <ModalForm action={bookAppointment} title={`Book an appointment for ${person.firstName}`} triggerLabel="Book appointment" submitLabel="Book appointment">
            <AppointmentFields types={settings.appointment_types} staff={staff} prefix="person-book" defaults={{ individualId: id, date: addDays(dateKey(), 7) }} />
          </ModalForm>
        )}
      </div>

      {toDocument.length > 0 && (
        <Panel title={`Needs documenting (${toDocument.length})`} className="ring-2 ring-accent/40">
          <AppointmentList rows={toDocument} now={now} documentHours={hours} showPerson={false} empty="" />
        </Panel>
      )}
      {followups.length > 0 && (
        <Panel title={`Follow-ups to book (${followups.length})`}>
          <AppointmentList rows={followups} now={now} documentHours={hours} showPerson={false} empty="" />
        </Panel>
      )}
      <Panel title={`Booked (${upcoming.length})`}>
        <AppointmentList rows={upcoming} now={now} documentHours={hours} showPerson={false} empty={`Nothing booked for ${person.firstName}.`} />
      </Panel>
      <Panel title="History">
        <AppointmentList rows={past.filter(row => row.status !== "scheduled")} now={now} documentHours={hours} showPerson={false} empty="No past appointments yet." />
      </Panel>
    </div>
  );
}
