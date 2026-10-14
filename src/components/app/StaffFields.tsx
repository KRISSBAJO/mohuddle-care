import { Select } from "@/components/app/Select";
import { Field } from "@/components/app/ui";
import { labels } from "@/lib/format";
import type { schema } from "@/server/db";

type Member = typeof schema.staff.$inferSelect;
type Home = { id: string; name: string };

/* The staff form fields, shared by the add and edit pages. */
export function StaffFields({ homes, member, prefix, loginEmail, employmentTypes = [] }: { homes: Home[]; member?: Member; prefix: string; loginEmail?: boolean; employmentTypes?: string[] }) {
  const id = (name: string) => `${prefix}-${name}`;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="First name" htmlFor={id("first")}>
        <input id={id("first")} name="firstName" required maxLength={80} autoComplete="off" className="field" defaultValue={member?.firstName} />
      </Field>
      <Field label="Last name" htmlFor={id("last")}>
        <input id={id("last")} name="lastName" required maxLength={80} autoComplete="off" className="field" defaultValue={member?.lastName} />
      </Field>
      <Field label="Job" htmlFor={id("role")}>
        <Select id={id("role")} name="role" defaultValue={member?.role ?? "dsp"} options={Object.entries(labels.staffRole).map(([value, text]) => ({ value, label: text }))} />
      </Field>
      <Field label="Based at" htmlFor={id("home")}>
        <Select id={id("home")} name="homeId" searchable defaultValue={member?.homeId ?? ""} emptyLabel="Floating or office" options={homes.map(home => ({ value: home.id, label: home.name }))} />
      </Field>
      <Field label="Email" htmlFor={id("email")} hint={loginEmail ? "This is also their sign-in email." : "Used for their Mohuddle login later."}>
        <input id={id("email")} name="email" type="email" required maxLength={200} autoComplete="off" className="field" defaultValue={member?.email} />
      </Field>
      <Field label="Phone" htmlFor={id("phone")}>
        <input id={id("phone")} name="phone" type="tel" maxLength={40} autoComplete="off" className="field" defaultValue={member?.phone} />
      </Field>
      <Field label="Hired" htmlFor={id("hired")}>
        <input id={id("hired")} name="hiredAt" type="date" className="field" defaultValue={member?.hiredAt ?? ""} />
      </Field>
      <Field label="Employment" htmlFor={id("employment")}>
        <Select id={id("employment")} name="employmentType" defaultValue={member?.employmentType ?? ""} emptyLabel="Not set" options={[...new Set([...(member?.employmentType ? [member.employmentType] : []), ...employmentTypes])].map(type => ({ value: type, label: type }))} />
      </Field>
      <Field label="Employee number" htmlFor={id("number")} hint="As used by payroll.">
        <input id={id("number")} name="employeeNumber" maxLength={40} autoComplete="off" className="field" defaultValue={member?.employeeNumber} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Home address" htmlFor={id("address")}>
          <input id={id("address")} name="address" maxLength={200} autoComplete="off" className="field" defaultValue={member?.address} />
        </Field>
      </div>
      <Field label="Emergency contact" htmlFor={id("emergency")}>
        <input id={id("emergency")} name="emergencyContact" maxLength={120} autoComplete="off" className="field" defaultValue={member?.emergencyContact} />
      </Field>
      <Field label="Emergency phone" htmlFor={id("emergency-phone")}>
        <input id={id("emergency-phone")} name="emergencyPhone" type="tel" maxLength={40} autoComplete="off" className="field" defaultValue={member?.emergencyPhone} />
      </Field>
    </div>
  );
}
