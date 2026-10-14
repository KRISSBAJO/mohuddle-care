import { notFound } from "next/navigation";
import { IndividualForm } from "@/components/app/IndividualForm";
import { PageHeader } from "@/components/app/ui";
import { updateIndividual } from "@/server/actions/hub";
import { requireManager } from "@/server/guard";
import { individualDetail, listHomes } from "@/server/queries/hub";

export const metadata = { title: "Edit person" };

export default async function EditIndividualPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  const [detail, homes] = await Promise.all([individualDetail(id), listHomes()]);
  if (!detail) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="People we support" title={`Edit ${detail.person.firstName} ${detail.person.lastName}`} />
      <IndividualForm action={updateIndividual.bind(null, id)} homes={homes} person={detail.person} />
    </div>
  );
}
