import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppointmentForm } from "@/components/appointments/AppointmentForm";
import { PageHeader } from "@/components/app/ui";
import { addDays, dateKey } from "@/lib/format";
import { bookAppointment } from "@/server/actions/appointments";
import { requireUser } from "@/server/guard";
import { appointmentDetail } from "@/server/queries/appointments";
import { appointmentFormData } from "@/server/queries/appointment-form";

export const metadata = { title: "Book an appointment" };

/* Booking a visit, from the Appointments page, a person's page, or as a follow-up to an earlier visit. */
export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<{ individual?: string; followUpOf?: string }> }) {
  await requireUser();
  const { individual, followUpOf } = await searchParams;
  const data = await appointmentFormData();
  const earlier = followUpOf && /^[0-9a-f-]{36}$/.test(followUpOf) ? await appointmentDetail(followUpOf) : null;
  const personId = earlier?.person.id ?? (individual && data.people.some(person => person.value === individual) ? individual : "");
  const back = earlier ? `/app/appointments/${earlier.appointment.id}` : personId ? `/app/individuals/${personId}?tab=appointments` : "/app/appointments";
  const a = earlier?.appointment;

  return (
    <div className="max-w-4xl">
      <Link href={back} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> {earlier ? "Back to the earlier visit" : personId ? "Back to their appointments" : "All appointments"}
      </Link>
      <PageHeader
        eyebrow="Appointments"
        title={earlier ? "Book the follow-up" : "Book an appointment"}
        description="Booking tells the staff member going, the home manager and the team. Reminders go out before the visit and on the day."
      />
      <div className="mt-6">
        <AppointmentForm
          action={bookAppointment}
          submitLabel="Book appointment"
          types={data.types}
          staff={data.staff}
          people={data.people}
          contacts={data.contacts}
          lockPerson={Boolean(earlier)}
          initial={{
            individualId: personId,
            type: a?.type ?? "",
            provider: a?.provider ?? "",
            clinic: a?.clinic ?? "",
            phone: a?.phone ?? "",
            address: a?.address ?? "",
            date: a?.followUpBy ?? addDays(dateKey(), 7),
            time: "10:00",
            durationMinutes: a?.durationMinutes ?? 60,
            reason: a ? a.followUpNotes || `Follow-up from ${a.scheduledAt.toISOString().slice(0, 10)}` : "",
            prep: "",
            transport: a?.transport ?? "",
            escortStaffId: a?.escortStaffId ?? "",
            followUpOf: a?.id ?? "",
          }}
        />
      </div>
    </div>
  );
}
