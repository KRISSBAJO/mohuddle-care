import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { StaffFields } from "@/components/app/StaffFields";
import { PageHeader } from "@/components/app/ui";
import { updateStaff } from "@/server/actions/editing";
import { requireManager } from "@/server/guard";
import { listHomes, staffDetail } from "@/server/queries/hub";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Edit a staff member" };

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, homes, settings] = await Promise.all([staffDetail(id), listHomes(), getSettings()]);
  if (!detail) notFound();
  const { member } = detail;
  return (
    <div className="max-w-3xl">
      <Link href={`/app/staff/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to {member.firstName}
      </Link>
      <PageHeader eyebrow="Staff" title={`Edit ${member.firstName} ${member.lastName}`} description="Credentials, documents and their login are managed on their own tabs." />
      <ActionForm action={updateStaff.bind(null, id)} submitLabel="Save details" className="card p-6">
        <StaffFields homes={homes} member={member} prefix="edit-staff" loginEmail={Boolean(detail.login)} employmentTypes={settings.employment_types} />
      </ActionForm>
    </div>
  );
}
