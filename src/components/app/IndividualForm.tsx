import { ActionForm } from "@/components/app/ActionForm";
import { Field } from "@/components/app/ui";
import { labels } from "@/lib/format";
import type { FormState } from "@/server/actions/auth";
import type { schema } from "@/server/db";

type Individual = typeof schema.individuals.$inferSelect;
type Home = typeof schema.homes.$inferSelect;

export function IndividualForm({
  action,
  homes,
  person,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  homes: Home[];
  person?: Individual;
}) {
  return (
    <ActionForm action={action} submitLabel={person ? "Save changes" : "Add person"} className="card p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName"><input id="firstName" name="firstName" required className="field" defaultValue={person?.firstName} /></Field>
        <Field label="Last name" htmlFor="lastName"><input id="lastName" name="lastName" required className="field" defaultValue={person?.lastName} /></Field>
        <Field label="Date of birth" htmlFor="dob"><input id="dob" name="dob" type="date" className="field" defaultValue={person?.dob ?? ""} /></Field>
        <Field label="Support started" htmlFor="admittedAt"><input id="admittedAt" name="admittedAt" type="date" className="field" defaultValue={person?.admittedAt ?? ""} /></Field>
        <Field label="Service" htmlFor="serviceType">
          <select id="serviceType" name="serviceType" className="field" defaultValue={person?.serviceType ?? "supported_living"}>
            {Object.entries(labels.serviceType).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </Field>
        <Field label="Home" htmlFor="homeId">
          <select id="homeId" name="homeId" className="field" defaultValue={person?.homeId ?? ""}>
            <option value="">Not in a Milestone home</option>
            {homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}
          </select>
        </Field>
        <Field label="Guardian or family contact" htmlFor="guardianName"><input id="guardianName" name="guardianName" className="field" defaultValue={person?.guardianName} /></Field>
        <Field label="Guardian phone" htmlFor="guardianPhone"><input id="guardianPhone" name="guardianPhone" type="tel" className="field" defaultValue={person?.guardianPhone} /></Field>
        <Field label="Emergency contact" htmlFor="emergencyContact"><input id="emergencyContact" name="emergencyContact" className="field" defaultValue={person?.emergencyContact} /></Field>
        <Field label="Emergency phone" htmlFor="emergencyPhone"><input id="emergencyPhone" name="emergencyPhone" type="tel" className="field" defaultValue={person?.emergencyPhone} /></Field>
      </div>
      <Field label="Allergies" htmlFor="allergies"><input id="allergies" name="allergies" className="field" defaultValue={person?.allergies} placeholder="None known" /></Field>
      <Field label="Diagnoses" htmlFor="diagnoses"><input id="diagnoses" name="diagnoses" className="field" defaultValue={person?.diagnoses} /></Field>
      <Field label="How to support this person well" htmlFor="supportNotes" hint="Communication, routines, what calms, what to avoid. Staff read this before every first shift.">
        <textarea id="supportNotes" name="supportNotes" rows={5} className="field" defaultValue={person?.supportNotes} />
      </Field>
    </ActionForm>
  );
}
