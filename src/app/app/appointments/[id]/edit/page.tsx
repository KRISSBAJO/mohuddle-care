import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppointmentForm } from "@/components/appointments/AppointmentForm";
import { PageHeader } from "@/components/app/ui";
import { dateKey, zone } from "@/lib/format";
import { updateAppointment } from "@/server/actions/appointments";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { appointmentDetail } from "@/server/queries/appointments";
import { appointmentFormData } from "@/server/queries/appointment-form";

export const metadata = { title: "Change an appointment" };

const clock = (at: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: zone(), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);

export default async function EditAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, data] = await Promise.all([appointmentDetail(id), appointmentFormData()]);
  if (!detail) notFound();
  const a = detail.appointment;
  if (a.status !== "scheduled" || !(canManage(user) || user.role === "nurse" || a.createdBy === user.id)) redirect(`/app/appointments/${id}`);

  return (
    <div className="max-w-4xl">
      <Link href={`/app/appointments/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to the appointment
      </Link>
      <PageHeader eyebrow="Appointments" title={`Change ${detail.person.firstName}'s ${a.type.toLowerCase()} visit`} description="A new time or a different escort is sent to the team again." />
      <div className="mt-6">
        <AppointmentForm
          action={updateAppointment.bind(null, id)}
          submitLabel="Save changes"
          types={data.types}
          staff={data.staff}
          people={data.people}
          contacts={data.contacts}
          lockPerson
          initial={{
            individualId: a.individualId,
            type: a.type,
            provider: a.provider,
            clinic: a.clinic,
            phone: a.phone,
            address: a.address,
            date: dateKey(a.scheduledAt),
            time: clock(a.scheduledAt),
            durationMinutes: a.durationMinutes,
            reason: a.reason,
            prep: a.prep,
            transport: a.transport,
            escortStaffId: a.escortStaffId ?? "",
            followUpOf: "",
          }}
        />
      </div>
    </div>
  );
}
