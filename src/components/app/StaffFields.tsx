import { Field } from "@/components/app/ui";
import { labels } from "@/lib/format";
import type { schema } from "@/server/db";

type Member = typeof schema.staff.$inferSelect;
type Home = { id: string; name: string };

/* The staff form fields, shared by the add and edit pop-ups. */
export function StaffFields({ homes, member, prefix, loginEmail }: { homes: Home[]; member?: Member; prefix: string; loginEmail?: boolean }) {
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
        <select id={id("role")} name="role" className="field" defaultValue={member?.role ?? "dsp"}>
          {Object.entries(labels.staffRole).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
      </Field>
      <Field label="Based at" htmlFor={id("home")}>
        <select id={id("home")} name="homeId" className="field" defaultValue={member?.homeId ?? ""}>
          <option value="">Floating or office</option>
          {homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}
        </select>
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
    </div>
  );
}
