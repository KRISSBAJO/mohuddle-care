import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { Field, PageHeader, Panel } from "@/components/app/ui";
import { changeMedication, stopMedication } from "@/server/actions/editing";
import { requireManager } from "@/server/guard";
import { medicationDetail } from "@/server/queries/hub";

export const metadata = { title: "Change medication" };

export default async function MedicationPage({ params }: { params: Promise<{ id: string; medId: string }> }) {
  await requireManager();
  const { id, medId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(medId)) notFound();
  const row = await medicationDetail(medId);
  if (!row || row.med.individualId !== id) notFound();
  const { med } = row;
  const back = `/app/individuals/${id}?tab=medications`;

  if (!med.active) {
    return (
      <div className="max-w-2xl">
        <Link href={back} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Back to {row.first}</Link>
        <PageHeader eyebrow="Medication" title={`${med.name} ${med.dose}`} description={`Stopped. ${med.stopReason}`} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <Link href={back} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Back to {row.first}</Link>
      <PageHeader
        eyebrow={`Medication for ${row.first} ${row.last}`}
        title={`${med.name} ${med.dose}`}
        description="Changes take effect from now. Past medication records keep the dose that was given, and doses already due stay on the record to be signed."
      />

      <Panel title="Change the order">
        <div className="p-5">
          <ActionForm action={changeMedication.bind(null, med.id)} submitLabel="Save change">
            <Field label="Name" htmlFor="med-name"><input id="med-name" name="name" required className="field" defaultValue={med.name} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Dose" htmlFor="med-dose"><input id="med-dose" name="dose" required className="field" defaultValue={med.dose} /></Field>
              <Field label="Route" htmlFor="med-route"><input id="med-route" name="route" className="field" defaultValue={med.route} /></Field>
            </div>
            <Field label="Times" htmlFor="med-times" hint="24-hour, separated by commas"><input id="med-times" name="times" required className="field" defaultValue={med.times.join(", ")} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prescriber" htmlFor="med-prescriber"><input id="med-prescriber" name="prescriber" className="field" defaultValue={med.prescriber} /></Field>
              <Field label="Instructions" htmlFor="med-instructions"><input id="med-instructions" name="instructions" className="field" defaultValue={med.instructions} /></Field>
            </div>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="controlled" defaultChecked={med.controlled} className="mt-0.5 h-4 w-4" />
              <span><span className="font-semibold">Controlled medicine</span> <span className="text-mute">Counted on a count sheet. On the phone app it can only be recorded with a signal.</span></span>
            </label>
            <Field label="Why it changed" htmlFor="med-reason" hint="Kept with the record, for example who ordered it and when.">
              <input id="med-reason" name="reason" required minLength={3} className="field" placeholder="Dr. Ferris increased dose at 10/14 visit" />
            </Field>
          </ActionForm>
        </div>
      </Panel>

      <Panel title="Stop this medication" className="mt-6">
        <div className="p-5">
          <ActionForm action={stopMedication.bind(null, med.id)} submitLabel="Stop medication">
            <p className="text-sm text-mute">Upcoming doses are removed. Doses already due stay on the record so they can still be signed.</p>
            <Field label="Why it was stopped" htmlFor="stop-reason">
              <input id="stop-reason" name="reason" required minLength={3} className="field" placeholder="Discontinued by Dr. Shah, 10/14" />
            </Field>
          </ActionForm>
        </div>
      </Panel>
    </div>
  );
}
