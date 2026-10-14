import { IndividualForm } from "@/components/app/IndividualForm";
import { PageHeader } from "@/components/app/ui";
import { createIndividual } from "@/server/actions/hub";
import { requireManager } from "@/server/guard";
import { listHomes } from "@/server/queries/hub";

export const metadata = { title: "Add a person" };

export default async function NewIndividualPage() {
  await requireManager();
  const homes = await listHomes();
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="People we support" title="Add a person" description="Start with the basics. Goals, medications and logs come after." />
      <IndividualForm action={createIndividual} homes={homes} />
    </div>
  );
}
