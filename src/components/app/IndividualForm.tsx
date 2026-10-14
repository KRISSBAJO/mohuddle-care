import { ActionForm } from "@/components/app/ActionForm";
import { Field } from "@/components/app/ui";
import { labels } from "@/lib/format";
import type { FormState } from "@/server/actions/auth";
import type { schema } from "@/server/db";

type Individual = typeof schema.individuals.$inferSelect;
type Home = { id: string; name: string };

/*
 * The person form fields. "compact" shows only what is needed to start, for the add pop-up.
 * The edit form must always use the full set: a field left out would be saved as empty.
 */
export function IndividualFields({ homes, person, prefix = "person", compact = false }: { homes: Home[]; person?: Individual; prefix?: string; compact?: boolean }) {
  const id = (name: string) => `${prefix}-${name}`;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor={id("first")}><input id={id("first")} name="firstName" required maxLength={80} autoComplete="off" className="field" defaultValue={person?.firstName} /></Field>
        <Field label="Last name" htmlFor={id("last")}><input id={id("last")} name="lastName" required maxLength={80} autoComplete="off" className="field" defaultValue={person?.lastName} /></Field>
        <Field label="Date of birth" htmlFor={id("dob")}><input id={id("dob")} name="dob" type="date" className="field" defaultValue={person?.dob ?? ""} /></Field>
        <Field label="Support started" htmlFor={id("admitted")}><input id={id("admitted")} name="admittedAt" type="date" className="field" defaultValue={person?.admittedAt ?? ""} /></Field>
        <Field label="Service" htmlFor={id("service")}>
          <select id={id("service")} name="serviceType" className="field" defaultValue={person?.serviceType ?? "supported_living"}>
            {Object.entries(labels.serviceType).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </Field>
        <Field label="Home" htmlFor={id("home")}>
          <select id={id("home")} name="homeId" className="field" defaultValue={person?.homeId ?? ""}>
            <option value="">Not in a Milestone home</option>
            {homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}
          </select>
        </Field>
        <Field label="Guardian or family contact" htmlFor={id("guardian")}><input id={id("guardian")} name="guardianName" maxLength={120} className="field" defaultValue={person?.guardianName} /></Field>
        <Field label="Guardian phone" htmlFor={id("guardian-phone")}><input id={id("guardian-phone")} name="guardianPhone" type="tel" maxLength={40} className="field" defaultValue={person?.guardianPhone} /></Field>
        {!compact && (
          <>
            <Field label="Emergency contact" htmlFor={id("emergency")}><input id={id("emergency")} name="emergencyContact" maxLength={120} className="field" defaultValue={person?.emergencyContact} /></Field>
            <Field label="Emergency phone" htmlFor={id("emergency-phone")}><input id={id("emergency-phone")} name="emergencyPhone" type="tel" maxLength={40} className="field" defaultValue={person?.emergencyPhone} /></Field>
          </>
        )}
      </div>
      <Field label="Allergies" htmlFor={id("allergies")}><input id={id("allergies")} name="allergies" maxLength={500} className="field" defaultValue={person?.allergies} placeholder="None known" /></Field>
      {!compact && (
        <>
          <Field label="Diagnoses" htmlFor={id("diagnoses")}><input id={id("diagnoses")} name="diagnoses" maxLength={1000} className="field" defaultValue={person?.diagnoses} /></Field>
          <Field label="How to support this person well" htmlFor={id("notes")} hint="Communication, routines, what calms, what to avoid. Staff read this before every first shift.">
            <textarea id={id("notes")} name="supportNotes" rows={5} maxLength={4000} className="field" defaultValue={person?.supportNotes} />
          </Field>
        </>
      )}
    </>
  );
}

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
      <IndividualFields homes={homes} person={person} />
    </ActionForm>
  );
}
