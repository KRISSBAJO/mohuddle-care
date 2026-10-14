import { ActionForm } from "@/components/app/ActionForm";
import { Field } from "@/components/app/ui";
import { labels } from "@/lib/format";
import type { FormState } from "@/server/actions/auth";
import type { schema } from "@/server/db";

type Individual = typeof schema.individuals.$inferSelect;
type Home = { id: string; name: string };

/*
 * The fields for changing a person's details. Every field must be here: one left out would be saved
 * as empty. Adding a person uses the step-by-step form instead.
 */
export function IndividualFields({ homes, person, prefix = "person", lists }: { homes: Home[]; person?: Individual; prefix?: string; lists?: { communication: string[]; mobility: string[]; diet: string[] } }) {
  const id = (name: string) => `${prefix}-${name}`;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor={id("first")}><input id={id("first")} name="firstName" required maxLength={80} autoComplete="off" className="field" defaultValue={person?.firstName} /></Field>
        <Field label="Last name" htmlFor={id("last")}><input id={id("last")} name="lastName" required maxLength={80} autoComplete="off" className="field" defaultValue={person?.lastName} /></Field>
        <Field label="Likes to be called" htmlFor={id("preferred")}><input id={id("preferred")} name="preferredName" maxLength={80} className="field" defaultValue={person?.preferredName} /></Field>
        <Field label="Pronouns" htmlFor={id("pronouns")}><input id={id("pronouns")} name="pronouns" maxLength={40} className="field" defaultValue={person?.pronouns} /></Field>
        <Field label="Gender" htmlFor={id("gender")}><input id={id("gender")} name="gender" maxLength={40} className="field" defaultValue={person?.gender} /></Field>
        <Field label="Main language" htmlFor={id("language")}><input id={id("language")} name="primaryLanguage" maxLength={60} className="field" defaultValue={person?.primaryLanguage} /></Field>
        <Field label="Date of birth" htmlFor={id("dob")}><input id={id("dob")} name="dob" type="date" className="field" defaultValue={person?.dob ?? ""} /></Field>
        <Field label="Support started" htmlFor={id("admitted")}><input id={id("admitted")} name="admittedAt" type="date" className="field" defaultValue={person?.admittedAt ?? ""} /></Field>
        <Field label="Service" htmlFor={id("service")}>
          <select id={id("service")} name="serviceType" className="field" defaultValue={person?.serviceType ?? "supported_living"}>
            {Object.entries(labels.serviceType).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </Field>
        <Field label="Home" htmlFor={id("home")}>
          <select id={id("home")} name="homeId" className="field" defaultValue={person?.homeId ?? ""}>
            <option value="">Not in one of our homes</option>
            {homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}
          </select>
        </Field>
        <Field label="Guardian or family contact" htmlFor={id("guardian")}><input id={id("guardian")} name="guardianName" maxLength={120} className="field" defaultValue={person?.guardianName} /></Field>
        <Field label="Guardian phone" htmlFor={id("guardian-phone")}><input id={id("guardian-phone")} name="guardianPhone" type="tel" maxLength={40} className="field" defaultValue={person?.guardianPhone} /></Field>
        <Field label="Emergency contact" htmlFor={id("emergency")}><input id={id("emergency")} name="emergencyContact" maxLength={120} className="field" defaultValue={person?.emergencyContact} /></Field>
        <Field label="Emergency phone" htmlFor={id("emergency-phone")}><input id={id("emergency-phone")} name="emergencyPhone" type="tel" maxLength={40} className="field" defaultValue={person?.emergencyPhone} /></Field>
        <Field label="How they communicate" htmlFor={id("communication")}><input id={id("communication")} name="communication" maxLength={500} list={id("communication-list")} className="field" defaultValue={person?.communication} /></Field>
        <Field label="Mobility" htmlFor={id("mobility")}><input id={id("mobility")} name="mobility" maxLength={500} list={id("mobility-list")} className="field" defaultValue={person?.mobility} /></Field>
        <Field label="Diet" htmlFor={id("diet")}><input id={id("diet")} name="diet" maxLength={500} list={id("diet-list")} className="field" defaultValue={person?.diet} /></Field>
      </div>
      {lists && (
        <>
          <datalist id={id("communication-list")}>{lists.communication.map(option => <option key={option} value={option} />)}</datalist>
          <datalist id={id("mobility-list")}>{lists.mobility.map(option => <option key={option} value={option} />)}</datalist>
          <datalist id={id("diet-list")}>{lists.diet.map(option => <option key={option} value={option} />)}</datalist>
        </>
      )}
      <Field label="Allergies" htmlFor={id("allergies")}><input id={id("allergies")} name="allergies" maxLength={500} className="field" defaultValue={person?.allergies} placeholder="None known" /></Field>
      <Field label="Diagnoses" htmlFor={id("diagnoses")}><input id={id("diagnoses")} name="diagnoses" maxLength={1000} className="field" defaultValue={person?.diagnoses} /></Field>
          <Field label="How to support this person well" htmlFor={id("notes")} hint="Communication, routines, what calms, what to avoid. Staff read this before every first shift.">
            <textarea id={id("notes")} name="supportNotes" rows={5} maxLength={4000} className="field" defaultValue={person?.supportNotes} />
          </Field>
      <Field label="Likes and interests" htmlFor={id("likes")}><textarea id={id("likes")} name="likes" rows={3} maxLength={1000} className="field" defaultValue={person?.likes} /></Field>
    </>
  );
}

export function IndividualForm({
  action,
  homes,
  person,
  lists,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  homes: Home[];
  person?: Individual;
  lists?: { communication: string[]; mobility: string[]; diet: string[] };
}) {
  return (
    <ActionForm action={action} submitLabel={person ? "Save changes" : "Add person"} className="card p-6">
      <IndividualFields homes={homes} person={person} lists={lists} />
    </ActionForm>
  );
}
