import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { StaffFields } from "@/components/app/StaffFields";
import { PageHeader } from "@/components/app/ui";
import { createStaff } from "@/server/actions/hub";
import { requireManager } from "@/server/guard";
import { listHomes } from "@/server/queries/hub";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Add a staff member" };

export default async function NewStaffPage() {
  await requireManager();
  const [homes, settings] = await Promise.all([listHomes(), getSettings()]);
  return (
    <div className="max-w-3xl">
      <Link href="/app/staff" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All staff
      </Link>
      <PageHeader eyebrow="Staff" title="Add a staff member" description="Their login, credentials and documents are set up on the next page." />
      <ActionForm action={createStaff} submitLabel="Add and open" className="card p-6">
        <StaffFields homes={homes} prefix="new-staff" employmentTypes={settings.employment_types} />
      </ActionForm>
    </div>
  );
}
