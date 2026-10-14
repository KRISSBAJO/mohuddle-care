import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { IndividualForm } from "@/components/app/IndividualForm";
import { PageHeader } from "@/components/app/ui";
import { updateIndividual } from "@/server/actions/hub";
import { requireManager } from "@/server/guard";
import { individualDetail, listHomes } from "@/server/queries/hub";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Edit person" };

export default async function EditIndividualPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, homes, settings] = await Promise.all([individualDetail(id), listHomes(), getSettings()]);
  if (!detail) notFound();
  return (
    <div className="max-w-3xl">
      <Link href={`/app/individuals/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to {detail.person.firstName}
      </Link>
      <PageHeader eyebrow="People we support" title={`Edit ${detail.person.firstName} ${detail.person.lastName}`} description="Care team, insurance, goals and medications are changed on their own tabs." />
      <IndividualForm
        action={updateIndividual.bind(null, id)}
        homes={homes}
        person={detail.person}
        lists={{ communication: settings.communication_options, mobility: settings.mobility_options, diet: settings.diet_options, waivers: settings.waiver_types }}
      />
    </div>
  );
}
