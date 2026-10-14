"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
  HeartPulse,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Smile,
  Target,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { Select } from "@/components/app/Select";
import { cn } from "@/lib/cn";
import { FIELD_TYPES, OPTIONAL_SECTIONS, SECTION_KEYS, type FieldType, type SectionKey } from "@/lib/note-requirements";
import type { FormState } from "@/server/actions/auth";

type SectionState = { on: boolean; required: boolean };
export type NoteDefaults = { sections: Record<SectionKey, SectionState>; items: { label: string; from: string }[] };

type Person = {
  firstName: string;
  lastName: string;
  preferredName: string;
  dob: string;
  gender: string;
  pronouns: string;
  primaryLanguage: string;
  homeId: string;
  serviceType: string;
  admittedAt: string;
  communication: string;
  mobility: string;
  diet: string;
  likes: string;
  supportNotes: string;
  allergies: string;
  diagnoses: string;
  guardianName: string;
  guardianPhone: string;
  emergencyContact: string;
  emergencyPhone: string;
};
type Med = { name: string; dose: string; route: string; times: string; prescriber: string; instructions: string };
type Contact = { role: string; name: string; organization: string; phone: string; email: string; address: string; isPrimary: boolean };
type Cover = { kind: string; rank: "primary" | "secondary" | "tertiary"; payer: string; plan: string; memberId: string; groupNumber: string; policyHolder: string; phone: string; effectiveFrom: string; effectiveTo: string };
type Goal = { title: string; description: string; measurableStep: string; frequencyCount: string; frequencyPeriod: "day" | "week" | "month"; effectiveDate: string; targetDate: string; documentedOn: string; setupNotes: string };
type Item = { label: string; fieldType: FieldType; options: string; unit: string; help: string; required: boolean };

const STEPS = [
  { key: "basics", title: "Who they are", hint: "Name, birthday, service and home.", icon: UserRound },
  { key: "living", title: "Daily life", hint: "Communication, mobility, diet and what matters to them.", icon: Smile },
  { key: "health", title: "Health and medication", hint: "Allergies, diagnoses and current medications.", icon: HeartPulse },
  { key: "contacts", title: "Family and care team", hint: "Guardian, emergency contact, ISC, doctors and pharmacy.", icon: Users },
  { key: "insurance", title: "Insurance", hint: "Medicaid, Medicare and any other cover.", icon: ShieldCheck },
  { key: "goals", title: "Plan goals", hint: "Desired outcomes and measurable steps from the ISP.", icon: Target },
  { key: "notes", title: "Daily notes", hint: "What staff must record for this person each shift.", icon: ClipboardList },
  { key: "review", title: "Review and add", hint: "Check everything, then add them.", icon: ClipboardCheck },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

/* Server errors name the part of the form they come from. This sends the user back to it. */
const ERROR_STEP: [RegExp, StepKey][] = [
  [/^Basics/, "basics"],
  [/^Medication/, "health"],
  [/^Care team/, "contacts"],
  [/^Insurance/, "insurance"],
  [/^Goal/, "goals"],
  [/^Daily note/, "notes"],
];

const blankMed = (): Med => ({ name: "", dose: "", route: "oral", times: "", prescriber: "", instructions: "" });
const blankContact = (role = ""): Contact => ({ role, name: "", organization: "", phone: "", email: "", address: "", isPrimary: true });
const blankCover = (rank: Cover["rank"]): Cover => ({ kind: "", rank, payer: "", plan: "", memberId: "", groupNumber: "", policyHolder: "", phone: "", effectiveFrom: "", effectiveTo: "" });
const blankGoal = (service: string): Goal => ({ title: "", description: "", measurableStep: "", frequencyCount: "", frequencyPeriod: "week", effectiveDate: "", targetDate: "", documentedOn: service, setupNotes: "" });
const blankItem = (): Item => ({ label: "", fieldType: "yes_no", options: "", unit: "", help: "", required: false });

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const splitTimes = (value: string) => value.split(/[,\s]+/).map(part => part.trim()).filter(Boolean);
const splitOptions = (value: string) => value.split(/[,\n]/).map(part => part.trim()).filter(Boolean);

function ageOn(dob: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const [y, m, d] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/* The first thing wrong on a step, in a sentence, or null when it is fine to move on. */
function checkStep(step: StepKey, d: { person: Person; medications: Med[]; contacts: Contact[]; insurance: Cover[]; goals: Goal[]; items: Item[] }, today: string): string | null {
  const p = d.person;
  if (step === "basics") {
    if (!p.firstName.trim()) return "Enter their first name.";
    if (!p.lastName.trim()) return "Enter their last name.";
    if (p.dob && p.dob > today) return "The date of birth is in the future.";
    if (!p.serviceType) return "Choose the service.";
  }
  if (step === "health") {
    for (const [i, med] of d.medications.entries()) {
      const n = `Medication ${i + 1}`;
      if (med.name.trim().length < 2) return `${n}: enter the medication name.`;
      if (!med.dose.trim()) return `${n}: enter the dose.`;
      const times = splitTimes(med.times);
      if (!times.length) return `${n}: add at least one time, for example 08:00.`;
      if (times.some(time => !TIME.test(time))) return `${n}: use 24-hour times like 08:00 or 20:00.`;
    }
  }
  if (step === "contacts") {
    for (const [i, c] of d.contacts.entries()) {
      const n = `Care team contact ${i + 1}`;
      if (!c.role) return `${n}: choose the role.`;
      if (c.name.trim().length < 2) return `${n}: enter their name.`;
      if (!c.phone.trim() && !c.email.trim()) return `${n}: add a phone number or an email address.`;
      if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return `${n}: check the email address.`;
    }
  }
  if (step === "insurance") {
    for (const [i, c] of d.insurance.entries()) {
      const n = `Insurance ${i + 1}`;
      if (!c.kind) return `${n}: choose the insurance type.`;
      if (c.payer.trim().length < 2) return `${n}: enter the insurer or plan name.`;
      if (c.memberId.trim().length < 2) return `${n}: enter the member or ID number.`;
      if (c.effectiveFrom && c.effectiveTo && c.effectiveTo < c.effectiveFrom) return `${n}: the end date is before the start date.`;
    }
  }
  if (step === "goals") {
    for (const [i, g] of d.goals.entries()) {
      const n = `Goal ${i + 1}`;
      if (g.title.trim().length < 3) return `${n}: write the desired outcome.`;
      if (g.frequencyCount && !(Number(g.frequencyCount) >= 1 && Number(g.frequencyCount) <= 31)) return `${n}: how often must be between 1 and 31.`;
    }
  }
  if (step === "notes") {
    for (const [i, item] of d.items.entries()) {
      const n = `Daily note question ${i + 1}`;
      if (item.label.trim().length < 3) return `${n}: write the question.`;
      if ((item.fieldType === "choice" || item.fieldType === "multi") && splitOptions(item.options).length < 2) return `${n}: give at least two answers, separated by commas.`;
    }
  }
  return null;
}

const Label = ({ htmlFor, children, optional }: { htmlFor: string; children: React.ReactNode; optional?: boolean }) => (
  <label htmlFor={htmlFor} className="label">
    {children}
    {optional && <span className="ml-1 font-normal text-dim">(optional)</span>}
  </label>
);

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-line pb-6 last:border-b-0 last:pb-0 md:grid-cols-[190px_1fr]">
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        {hint && <p className="mt-1 text-xs leading-relaxed text-mute">{hint}</p>}
      </div>
      <div className="grid min-w-0 gap-4">{children}</div>
    </section>
  );
}

function RowCard({ title, onRemove, children }: { title: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-mute">{title}</p>
        <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 text-xs font-semibold text-mute hover:text-[#a1361f]">
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </button>
      </div>
      <div className="grid gap-4">{children}</div>
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-3 text-sm font-semibold text-brand hover:border-brand hover:bg-brand/5">
      <Plus className="h-4 w-4" /> {children}
    </button>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cn("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-brand" : "bg-line")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

function Summary({ title, step, onEdit, children }: { title: string; step: StepKey; onEdit: (step: StepKey) => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold">{title}</h3>
        <button type="button" onClick={() => onEdit(step)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
          <Pencil className="h-3 w-3" /> Change
        </button>
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

const Facts = ({ rows, empty = "Nothing added." }: { rows: [string, string][]; empty?: string }) => {
  const shown = rows.filter(([, value]) => value);
  if (!shown.length) return <p className="text-mute">{empty}</p>;
  return (
    <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {shown.map(([key, value]) => (
        <div key={key} className="min-w-0">
          <dt className="text-xs text-mute">{key}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
};

/*
 * Adding a person, one step at a time. Nothing is saved until the last step, and then everything is
 * saved together. Each step is checked before moving on, and the server checks it all again.
 */
export function NewPersonWizard({
  action,
  today,
  homes,
  services,
  lists,
  noteDefaults,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  today: string;
  homes: { id: string; name: string }[];
  services: Record<string, string>;
  lists: { careTeamRoles: string[]; insuranceTypes: string[]; goalServices: string[]; communication: string[]; mobility: string[]; diet: string[] };
  /* Keyed by home id, with "" for people not in one of our homes. */
  noteDefaults: Record<string, NoteDefaults>;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const [step, setStep] = useState<StepKey>("basics");
  const [visited, setVisited] = useState<Set<StepKey>>(new Set(["basics"]));
  const [problem, setProblem] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [person, setPersonState] = useState<Person>({
    firstName: "",
    lastName: "",
    preferredName: "",
    dob: "",
    gender: "",
    pronouns: "",
    primaryLanguage: "English",
    homeId: "",
    serviceType: "supported_living",
    admittedAt: today,
    communication: "",
    mobility: "",
    diet: "",
    likes: "",
    supportNotes: "",
    allergies: "",
    diagnoses: "",
    guardianName: "",
    guardianPhone: "",
    emergencyContact: "",
    emergencyPhone: "",
  });
  const [medications, setMedications] = useState<Med[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [insurance, setInsurance] = useState<Cover[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [sectionChoice, setSectionChoice] = useState<Partial<Record<SectionKey, SectionState>>>({});
  const [items, setItems] = useState<Item[]>([]);
  const top = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);

  const index = STEPS.findIndex(s => s.key === step);
  const draft = { person, medications, contacts, insurance, goals, items };
  const inherited = noteDefaults[person.homeId] ?? noteDefaults[""];
  const sectionNow = (key: SectionKey) => sectionChoice[key] ?? inherited.sections[key];
  const name = person.preferredName.trim() || person.firstName.trim() || "this person";
  const homeName = homes.find(home => home.id === person.homeId)?.name;
  const age = ageOn(person.dob, today);

  const duplicate = state.error?.startsWith("DUPLICATE:") ? { id: state.error.split(":")[1], message: state.error.split(":").slice(2).join(":") } : null;
  const serverError = state.error && !duplicate ? state.error : null;
  const errorStep = serverError ? ERROR_STEP.find(([pattern]) => pattern.test(serverError))?.[1] : undefined;

  // Leaving the page with unsaved details asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (submitting.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!pending) submitting.current = false;
  }, [pending]);

  const touch = () => setDirty(true);
  const setPerson = <K extends keyof Person>(key: K, value: Person[K]) => {
    touch();
    setPersonState(current => ({ ...current, [key]: value }));
  };
  const bind = (key: keyof Person) => ({ value: person[key], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setPerson(key, event.target.value) });
  function edit<T>(setter: React.Dispatch<React.SetStateAction<T[]>>) {
    return {
      add: (row: T) => {
        touch();
        setter(rows => [...rows, row]);
      },
      remove: (at: number) => {
        touch();
        setter(rows => rows.filter((_, i) => i !== at));
      },
      change: (at: number, patch: Partial<T>) => {
        touch();
        setter(rows => rows.map((row, i) => (i === at ? { ...row, ...patch } : row)));
      },
    };
  }
  const meds = edit(setMedications);
  const team = edit(setContacts);
  const cover = edit(setInsurance);
  const goal = edit(setGoals);
  const item = edit(setItems);

  function go(next: StepKey) {
    const target = STEPS.findIndex(s => s.key === next);
    // Moving forward checks every step in between; going back never does.
    if (target > index) {
      for (const s of STEPS.slice(0, target)) {
        const message = checkStep(s.key, draft, today);
        if (message) {
          setStep(s.key);
          setProblem(message);
          return;
        }
      }
    }
    setProblem(null);
    setStep(next);
    setVisited(current => new Set([...current, next]));
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function payload() {
    const sections = SECTION_KEYS.flatMap(key => {
      const chosen = sectionChoice[key];
      const base = inherited.sections[key];
      if (!chosen || (chosen.on === base.on && chosen.required === base.required)) return [];
      return [{ section: key, enabled: chosen.on, required: chosen.on && chosen.required }];
    });
    return JSON.stringify({
      person,
      medications,
      contacts,
      insurance,
      goals,
      sections,
      items: items.map(row => ({ ...row, options: splitOptions(row.options) })),
      allowDuplicate,
    });
  }

  const counts: Partial<Record<StepKey, string>> = {
    health: medications.length ? `${medications.length} medication${medications.length === 1 ? "" : "s"}` : undefined,
    contacts: contacts.length ? `${contacts.length} on the care team` : undefined,
    insurance: insurance.length ? `${insurance.length} plan${insurance.length === 1 ? "" : "s"}` : undefined,
    goals: goals.length ? `${goals.length} goal${goals.length === 1 ? "" : "s"}` : undefined,
  };

  const current = STEPS[index];

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        // Enter in a field moves on a step rather than adding the person early.
        if (step !== "review") return go(STEPS[index + 1].key);
        const data = new FormData();
        data.set("payload", payload());
        submitting.current = true;
        startTransition(() => formAction(data));
      }}
      ref={top}
      className="grid scroll-mt-24 gap-6 lg:grid-cols-[260px_1fr]"
    >
      {/* The steps: a list down the side on wide screens, a progress bar on phones. */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="card p-4 lg:hidden">
          <div className="flex items-center justify-between text-xs font-semibold text-mute">
            <span>Step {index + 1} of {STEPS.length}</span>
            <span>{current.title}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>
        <ol className="card hidden p-2 lg:block">
          {STEPS.map((s, i) => {
            const active = s.key === step;
            const done = i < index || (visited.has(s.key) && !active && !checkStep(s.key, draft, today) && i < STEPS.length - 1);
            const Icon = s.icon;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => go(s.key)}
                  aria-current={active ? "step" : undefined}
                  className={cn("flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition", active ? "bg-brand/10" : "hover:bg-panel")}
                >
                  <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold", active ? "border-brand bg-brand text-white" : done ? "border-sage bg-sage/15 text-sage" : "border-line text-mute")}>
                    {done && !active ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-semibold", active ? "text-brand" : "text-ink")}>{s.title}</span>
                    <span className="block truncate text-xs text-mute">{counts[s.key] ?? s.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {person.firstName && (
          <div className="card mt-4 hidden p-4 text-sm lg:block">
            <p className="text-xs font-semibold uppercase tracking-wider text-mute">Adding</p>
            <p className="mt-1 font-bold">
              {person.firstName} {person.lastName}
              {person.preferredName && <span className="font-normal text-mute"> ({person.preferredName})</span>}
            </p>
            <p className="text-xs text-mute">
              {[age !== null ? `${age} years old` : "", services[person.serviceType], homeName ?? "Not in one of our homes"].filter(Boolean).join(" · ")}
            </p>
          </div>
        )}
      </aside>

      <div className="card min-w-0 p-6">
        <header className="mb-6 flex items-start gap-3 border-b border-line pb-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <current.icon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-mute">Step {index + 1} of {STEPS.length}</p>
            <h2 className="text-xl font-bold">{current.title}</h2>
            <p className="text-sm text-mute">{current.hint}</p>
          </div>
        </header>

        <div className="grid gap-6">
          {step === "basics" && (
            <>
              <Group title="Name" hint="As on their ISP and Medicaid records. Add the name they like to be called if it is different.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label htmlFor="np-first">First name</Label><input id="np-first" required maxLength={80} autoComplete="off" autoFocus className="field" {...bind("firstName")} /></div>
                  <div><Label htmlFor="np-last">Last name</Label><input id="np-last" required maxLength={80} autoComplete="off" className="field" {...bind("lastName")} /></div>
                  <div><Label htmlFor="np-preferred" optional>Likes to be called</Label><input id="np-preferred" maxLength={80} className="field" {...bind("preferredName")} placeholder="Bri" /></div>
                  <div><Label htmlFor="np-pronouns" optional>Pronouns</Label><input id="np-pronouns" maxLength={40} list="np-pronoun-list" className="field" {...bind("pronouns")} /></div>
                </div>
              </Group>
              <Group title="About them">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="np-dob" optional>Date of birth</Label>
                    <input id="np-dob" type="date" max={today} className="field" {...bind("dob")} />
                    {age !== null && <p className="mt-1 text-xs text-mute">{age} years old</p>}
                  </div>
                  <div><Label htmlFor="np-gender" optional>Gender</Label><input id="np-gender" maxLength={40} list="np-gender-list" className="field" {...bind("gender")} /></div>
                  <div><Label htmlFor="np-language" optional>Main language</Label><input id="np-language" maxLength={60} list="np-language-list" className="field" {...bind("primaryLanguage")} /></div>
                </div>
              </Group>
              <Group title="Service and home" hint="The home decides which staff, schedule and daily note settings apply.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="np-service">Service</Label>
                    <Select id="np-service" required value={person.serviceType} onChange={value => setPerson("serviceType", value)} options={Object.entries(services).map(([value, text]) => ({ value, label: text }))} />
                  </div>
                  <div>
                    <Label htmlFor="np-home">Home</Label>
                    <Select id="np-home" searchable value={person.homeId} onChange={value => setPerson("homeId", value)} emptyLabel="Not in one of our homes" options={homes.map(home => ({ value: home.id, label: home.name }))} />
                  </div>
                  <div><Label htmlFor="np-admitted" optional>Support started</Label><input id="np-admitted" type="date" className="field" {...bind("admittedAt")} /></div>
                </div>
              </Group>
              <datalist id="np-pronoun-list"><option value="she/her" /><option value="he/him" /><option value="they/them" /></datalist>
              <datalist id="np-gender-list"><option value="Female" /><option value="Male" /><option value="Non-binary" /><option value="Prefer not to say" /></datalist>
              <datalist id="np-language-list"><option value="English" /><option value="Spanish" /><option value="Arabic" /><option value="Kurdish" /><option value="American Sign Language" /></datalist>
            </>
          )}

          {step === "living" && (
            <>
              <Group title="Communication" hint={`How ${name} tells you things, and how to talk with them. Pick one or write your own.`}>
                <div>
                  <Label htmlFor="np-communication" optional>How they communicate</Label>
                  <input id="np-communication" maxLength={500} list="np-communication-list" className="field" {...bind("communication")} placeholder="Speaks a few words, points to pictures" />
                  <datalist id="np-communication-list">{lists.communication.map(option => <option key={option} value={option} />)}</datalist>
                </div>
              </Group>
              <Group title="Moving and eating">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="np-mobility" optional>Mobility</Label>
                    <input id="np-mobility" maxLength={500} list="np-mobility-list" className="field" {...bind("mobility")} />
                    <datalist id="np-mobility-list">{lists.mobility.map(option => <option key={option} value={option} />)}</datalist>
                  </div>
                  <div>
                    <Label htmlFor="np-diet" optional>Diet</Label>
                    <input id="np-diet" maxLength={500} list="np-diet-list" className="field" {...bind("diet")} />
                    <datalist id="np-diet-list">{lists.diet.map(option => <option key={option} value={option} />)}</datalist>
                  </div>
                </div>
              </Group>
              <Group title="What matters to them" hint="Likes, interests, people and routines. Staff use this to plan good days.">
                <div>
                  <Label htmlFor="np-likes" optional>Likes and interests</Label>
                  <textarea id="np-likes" rows={3} maxLength={1000} className="field" {...bind("likes")} placeholder="Gospel music, word searches, Sunday drives, calls with her sister" />
                </div>
                <div>
                  <Label htmlFor="np-support" optional>How to support {name} well</Label>
                  <textarea id="np-support" rows={6} maxLength={4000} className="field" {...bind("supportNotes")} placeholder="Routines, what calms them, what upsets them, what to avoid. Staff read this before their first shift." />
                  <p className="mt-1 text-right text-xs text-dim">{person.supportNotes.length} / 4000</p>
                </div>
              </Group>
            </>
          )}

          {step === "health" && (
            <>
              <Group title="Allergies and diagnoses" hint="Allergies show in red wherever staff see this person.">
                <div><Label htmlFor="np-allergies" optional>Allergies</Label><input id="np-allergies" maxLength={500} className="field" {...bind("allergies")} placeholder="None known" /></div>
                <div><Label htmlFor="np-diagnoses" optional>Diagnoses</Label><textarea id="np-diagnoses" rows={3} maxLength={1000} className="field" {...bind("diagnoses")} placeholder="Down syndrome, hypothyroidism" /></div>
              </Group>
              <Group title="Medications" hint="Each time becomes a dose on the medication record. Doses start from when the person is added.">
                {medications.map((med, i) => (
                  <RowCard key={i} title={`Medication ${i + 1}`} onRemove={() => meds.remove(i)}>
                    <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
                      <div><Label htmlFor={`np-med-${i}-name`}>Name</Label><input id={`np-med-${i}-name`} maxLength={120} className="field" value={med.name} onChange={e => meds.change(i, { name: e.target.value })} placeholder="Levothyroxine" /></div>
                      <div><Label htmlFor={`np-med-${i}-dose`}>Dose</Label><input id={`np-med-${i}-dose`} maxLength={80} className="field" value={med.dose} onChange={e => meds.change(i, { dose: e.target.value })} placeholder="50 mcg" /></div>
                      <div><Label htmlFor={`np-med-${i}-route`}>Route</Label><input id={`np-med-${i}-route`} maxLength={40} list="np-route-list" className="field" value={med.route} onChange={e => meds.change(i, { route: e.target.value })} /></div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor={`np-med-${i}-times`}>Times</Label>
                        <input id={`np-med-${i}-times`} className="field" value={med.times} onChange={e => meds.change(i, { times: e.target.value })} placeholder="08:00, 20:00" />
                        <p className="mt-1 text-xs text-mute">24-hour, separated by commas.</p>
                      </div>
                      <div><Label htmlFor={`np-med-${i}-prescriber`} optional>Prescriber</Label><input id={`np-med-${i}-prescriber`} maxLength={120} className="field" value={med.prescriber} onChange={e => meds.change(i, { prescriber: e.target.value })} /></div>
                    </div>
                    <div><Label htmlFor={`np-med-${i}-instructions`} optional>Instructions</Label><input id={`np-med-${i}-instructions`} maxLength={1000} className="field" value={med.instructions} onChange={e => meds.change(i, { instructions: e.target.value })} placeholder="On an empty stomach, 30 minutes before breakfast" /></div>
                  </RowCard>
                ))}
                <AddButton onClick={() => meds.add(blankMed())}>Add a medication</AddButton>
                <datalist id="np-route-list"><option value="oral" /><option value="topical" /><option value="inhaled" /><option value="eye drops" /><option value="ear drops" /><option value="injection" /><option value="G-tube" /><option value="rectal" /></datalist>
              </Group>
            </>
          )}

          {step === "contacts" && (
            <>
              <Group title="Guardian and emergency" hint="Shown on the profile and called first when something happens.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label htmlFor="np-guardian" optional>Guardian or family contact</Label><input id="np-guardian" maxLength={120} className="field" {...bind("guardianName")} /></div>
                  <div><Label htmlFor="np-guardian-phone" optional>Their phone</Label><input id="np-guardian-phone" type="tel" maxLength={40} className="field" {...bind("guardianPhone")} /></div>
                  <div><Label htmlFor="np-emergency" optional>Emergency contact</Label><input id="np-emergency" maxLength={120} className="field" {...bind("emergencyContact")} /></div>
                  <div><Label htmlFor="np-emergency-phone" optional>Their phone</Label><input id="np-emergency-phone" type="tel" maxLength={40} className="field" {...bind("emergencyPhone")} /></div>
                </div>
              </Group>
              <Group title="Care team" hint="The ISC, doctors, therapists, nutritionist and pharmacy. These fill in appointments automatically.">
                <div className="flex flex-wrap gap-2">
                  {lists.careTeamRoles
                    .filter(role => /ISC|primary care|pharmacy|nutrition|psychiatr|dentist|behavior/i.test(role))
                    .map(role => (
                      <button key={role} type="button" onClick={() => team.add(blankContact(role))} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs font-semibold text-mute hover:border-brand hover:text-brand">
                        <Plus className="h-3 w-3" /> {role.replace(/ \(ISC\)$/, "")}
                      </button>
                    ))}
                </div>
                {contacts.map((contact, i) => (
                  <RowCard key={i} title={contact.role || `Contact ${i + 1}`} onRemove={() => team.remove(i)}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor={`np-contact-${i}-role`}>Role</Label>
                        <Select id={`np-contact-${i}-role`} value={contact.role} onChange={value => team.change(i, { role: value })} options={lists.careTeamRoles.map(role => ({ value: role, label: role }))} />
                      </div>
                      <div><Label htmlFor={`np-contact-${i}-name`}>Name</Label><input id={`np-contact-${i}-name`} maxLength={120} className="field" value={contact.name} onChange={e => team.change(i, { name: e.target.value })} /></div>
                      <div><Label htmlFor={`np-contact-${i}-org`} optional>Organization or clinic</Label><input id={`np-contact-${i}-org`} maxLength={120} className="field" value={contact.organization} onChange={e => team.change(i, { organization: e.target.value })} /></div>
                      <div><Label htmlFor={`np-contact-${i}-phone`}>Phone</Label><input id={`np-contact-${i}-phone`} type="tel" maxLength={40} className="field" value={contact.phone} onChange={e => team.change(i, { phone: e.target.value })} /></div>
                      <div><Label htmlFor={`np-contact-${i}-email`} optional>Email</Label><input id={`np-contact-${i}-email`} type="email" maxLength={200} className="field" value={contact.email} onChange={e => team.change(i, { email: e.target.value })} /></div>
                      <div><Label htmlFor={`np-contact-${i}-address`} optional>Address</Label><input id={`np-contact-${i}-address`} maxLength={200} className="field" value={contact.address} onChange={e => team.change(i, { address: e.target.value })} /></div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={contact.isPrimary} onChange={e => team.change(i, { isPrimary: e.target.checked })} /> Main contact for this role
                    </label>
                  </RowCard>
                ))}
                <AddButton onClick={() => team.add(blankContact())}>Add someone else</AddButton>
              </Group>
            </>
          )}

          {step === "insurance" && (
            <Group title="Cover" hint="Add plans in billing order: primary first.">
              {insurance.map((c, i) => (
                <RowCard key={i} title={`${c.rank} insurance`} onRemove={() => cover.remove(i)}>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <Label htmlFor={`np-ins-${i}-kind`}>Type</Label>
                      <Select id={`np-ins-${i}-kind`} value={c.kind} onChange={value => cover.change(i, { kind: value })} options={lists.insuranceTypes.map(kind => ({ value: kind, label: kind }))} />
                    </div>
                    <div>
                      <Label htmlFor={`np-ins-${i}-rank`}>Order</Label>
                      <Select
                        id={`np-ins-${i}-rank`}
                        value={c.rank}
                        onChange={value => cover.change(i, { rank: value as Cover["rank"] })}
                        options={[
                          { value: "primary", label: "Primary" },
                          { value: "secondary", label: "Secondary" },
                          { value: "tertiary", label: "Tertiary" },
                        ]}
                      />
                    </div>
                    <div><Label htmlFor={`np-ins-${i}-payer`}>Insurer</Label><input id={`np-ins-${i}-payer`} maxLength={120} className="field" value={c.payer} onChange={e => cover.change(i, { payer: e.target.value })} placeholder="TennCare / Amerigroup" /></div>
                    <div><Label htmlFor={`np-ins-${i}-member`}>Member ID</Label><input id={`np-ins-${i}-member`} maxLength={60} autoComplete="off" className="field" value={c.memberId} onChange={e => cover.change(i, { memberId: e.target.value })} /></div>
                    <div><Label htmlFor={`np-ins-${i}-group`} optional>Group number</Label><input id={`np-ins-${i}-group`} maxLength={60} autoComplete="off" className="field" value={c.groupNumber} onChange={e => cover.change(i, { groupNumber: e.target.value })} /></div>
                    <div><Label htmlFor={`np-ins-${i}-plan`} optional>Plan name</Label><input id={`np-ins-${i}-plan`} maxLength={120} className="field" value={c.plan} onChange={e => cover.change(i, { plan: e.target.value })} /></div>
                    <div><Label htmlFor={`np-ins-${i}-holder`} optional>Policy holder</Label><input id={`np-ins-${i}-holder`} maxLength={120} className="field" value={c.policyHolder} onChange={e => cover.change(i, { policyHolder: e.target.value })} /></div>
                    <div><Label htmlFor={`np-ins-${i}-from`} optional>Covered from</Label><input id={`np-ins-${i}-from`} type="date" className="field" value={c.effectiveFrom} onChange={e => cover.change(i, { effectiveFrom: e.target.value })} /></div>
                    <div><Label htmlFor={`np-ins-${i}-to`} optional>Renewal or end date</Label><input id={`np-ins-${i}-to`} type="date" className="field" value={c.effectiveTo} onChange={e => cover.change(i, { effectiveTo: e.target.value })} /></div>
                  </div>
                  <div className="sm:w-1/3"><Label htmlFor={`np-ins-${i}-phone`} optional>Member services phone</Label><input id={`np-ins-${i}-phone`} type="tel" maxLength={40} className="field" value={c.phone} onChange={e => cover.change(i, { phone: e.target.value })} /></div>
                </RowCard>
              ))}
              {insurance.length < 8 && (
                <AddButton onClick={() => cover.add(blankCover(insurance.length === 0 ? "primary" : insurance.length === 1 ? "secondary" : "tertiary"))}>
                  Add {insurance.length === 0 ? "primary" : "another"} insurance
                </AddButton>
              )}
              <p className="text-xs text-mute">Renewal dates come back as reminders before they lapse.</p>
            </Group>
          )}

          {step === "goals" && (
            <Group title="Desired outcomes" hint="Copy them from the ISP. The measurable step and how often tell staff what to record, and the note counts how many times it is done.">
              {goals.map((g, i) => (
                <RowCard key={i} title={`Goal ${i + 1}`} onRemove={() => goal.remove(i)}>
                  <div><Label htmlFor={`np-goal-${i}-title`}>Desired outcome</Label><input id={`np-goal-${i}-title`} maxLength={160} className="field" value={g.title} onChange={e => goal.change(i, { title: e.target.value })} placeholder={`${name} wants to cook a meal on their own`} /></div>
                  <div><Label htmlFor={`np-goal-${i}-step`} optional>Measurable step</Label><textarea id={`np-goal-${i}-step`} rows={2} maxLength={500} className="field" value={g.measurableStep} onChange={e => goal.change(i, { measurableStep: e.target.value })} placeholder="With one verbal prompt, will gather ingredients for a simple meal" /></div>
                  <div className="grid gap-4 sm:grid-cols-4">
                    <div>
                      <Label htmlFor={`np-goal-${i}-count`} optional>How often</Label>
                      <input id={`np-goal-${i}-count`} type="number" min={1} max={31} className="field" value={g.frequencyCount} onChange={e => goal.change(i, { frequencyCount: e.target.value })} placeholder="3" />
                    </div>
                    <div>
                      <Label htmlFor={`np-goal-${i}-period`}>Per</Label>
                      <Select
                        id={`np-goal-${i}-period`}
                        value={g.frequencyPeriod}
                        onChange={value => goal.change(i, { frequencyPeriod: value as Goal["frequencyPeriod"] })}
                        options={[
                          { value: "day", label: "Day" },
                          { value: "week", label: "Week" },
                          { value: "month", label: "Month" },
                        ]}
                      />
                    </div>
                    <div><Label htmlFor={`np-goal-${i}-effective`} optional>Effective date</Label><input id={`np-goal-${i}-effective`} type="date" className="field" value={g.effectiveDate} onChange={e => goal.change(i, { effectiveDate: e.target.value })} /></div>
                    <div><Label htmlFor={`np-goal-${i}-target`} optional>Target date</Label><input id={`np-goal-${i}-target`} type="date" className="field" value={g.targetDate} onChange={e => goal.change(i, { targetDate: e.target.value })} /></div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor={`np-goal-${i}-service`}>Recorded on</Label>
                      <Select id={`np-goal-${i}-service`} value={g.documentedOn} onChange={value => goal.change(i, { documentedOn: value })} options={[...new Set([g.documentedOn, ...lists.goalServices])].map(service => ({ value: service, label: service }))} />
                    </div>
                    <div><Label htmlFor={`np-goal-${i}-setup`} optional>Note for staff</Label><input id={`np-goal-${i}-setup`} maxLength={1000} className="field" value={g.setupNotes} onChange={e => goal.change(i, { setupNotes: e.target.value })} placeholder="Use the picture recipe cards" /></div>
                  </div>
                  <div><Label htmlFor={`np-goal-${i}-details`} optional>What success looks like</Label><textarea id={`np-goal-${i}-details`} rows={2} maxLength={1000} className="field" value={g.description} onChange={e => goal.change(i, { description: e.target.value })} /></div>
                  {g.frequencyCount && <p className="rounded-lg bg-brand/5 px-3 py-2 text-xs text-brand">Staff will see “{g.frequencyCount} per {g.frequencyPeriod}” and how many times it has been recorded so far this {g.frequencyPeriod}.</p>}
                </RowCard>
              ))}
              <AddButton onClick={() => goal.add(blankGoal(lists.goalServices[0] ?? "Daily notes"))}>Add a goal</AddButton>
            </Group>
          )}

          {step === "notes" && (
            <>
              <Group title="Sections" hint={`Starts from ${homeName ? `${homeName}'s settings` : "the agency default"}. Changes here apply only to ${name}.`}>
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {SECTION_KEYS.map(key => {
                    const now = sectionNow(key);
                    const changed = Boolean(sectionChoice[key]) && (sectionChoice[key]!.on !== inherited.sections[key].on || sectionChoice[key]!.required !== inherited.sections[key].required);
                    const set = (patch: Partial<SectionState>) => {
                      touch();
                      setSectionChoice(choice => ({ ...choice, [key]: { ...now, ...patch } }));
                    };
                    return (
                      <li key={key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                            {OPTIONAL_SECTIONS[key].title}
                            {changed && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-[#8a5a10]">Changed for {name}</span>}
                          </p>
                          <p className="text-xs text-mute">{OPTIONAL_SECTIONS[key].hint}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          {now.on && (
                            <label className="flex items-center gap-1.5 text-xs text-mute">
                              <input type="checkbox" checked={now.required} onChange={e => set({ required: e.target.checked })} /> Must fill in
                            </label>
                          )}
                          {changed && (
                            <button type="button" className="text-xs font-semibold text-mute hover:text-ink" onClick={() => setSectionChoice(choice => ({ ...choice, [key]: undefined }))}>
                              Reset
                            </button>
                          )}
                          <Toggle on={now.on} onChange={on => set({ on })} label={OPTIONAL_SECTIONS[key].title} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Group>
              <Group title="Extra questions" hint={`Asked only on ${name}'s notes, for example "Weight checked" or "Thickened liquids used at every meal".`}>
                {inherited.items.length > 0 && (
                  <div className="rounded-xl bg-panel/60 p-3 text-xs text-mute">
                    <p className="mb-1 font-semibold text-ink">Already asked on every note for {name}:</p>
                    <ul className="list-inside list-disc">{inherited.items.map((row, i) => <li key={i}>{row.label} <span className="text-dim">({row.from})</span></li>)}</ul>
                  </div>
                )}
                {items.map((row, i) => (
                  <RowCard key={i} title={`Question ${i + 1}`} onRemove={() => item.remove(i)}>
                    <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                      <div><Label htmlFor={`np-item-${i}-label`}>Question</Label><input id={`np-item-${i}-label`} maxLength={160} className="field" value={row.label} onChange={e => item.change(i, { label: e.target.value })} placeholder="Weight checked this shift" /></div>
                      <div>
                        <Label htmlFor={`np-item-${i}-type`}>Answer</Label>
                        <Select id={`np-item-${i}-type`} value={row.fieldType} onChange={value => item.change(i, { fieldType: value as FieldType })} options={Object.entries(FIELD_TYPES).map(([value, text]) => ({ value, label: text }))} />
                      </div>
                    </div>
                    {(row.fieldType === "choice" || row.fieldType === "multi") && (
                      <div><Label htmlFor={`np-item-${i}-options`}>Answers to pick from</Label><input id={`np-item-${i}-options`} className="field" value={row.options} onChange={e => item.change(i, { options: e.target.value })} placeholder="Refused, Partial, All" /><p className="mt-1 text-xs text-mute">Separate with commas.</p></div>
                    )}
                    <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
                      {row.fieldType === "number" && <div><Label htmlFor={`np-item-${i}-unit`} optional>Unit</Label><input id={`np-item-${i}-unit`} maxLength={20} className="field" value={row.unit} onChange={e => item.change(i, { unit: e.target.value })} placeholder="lbs" /></div>}
                      <div className={row.fieldType === "number" ? "" : "sm:col-span-2"}><Label htmlFor={`np-item-${i}-help`} optional>Help for staff</Label><input id={`np-item-${i}-help`} maxLength={300} className="field" value={row.help} onChange={e => item.change(i, { help: e.target.value })} /></div>
                    </div>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={row.required} onChange={e => item.change(i, { required: e.target.checked })} /> Must be answered</label>
                  </RowCard>
                ))}
                <AddButton onClick={() => item.add(blankItem())}>Add a question</AddButton>
              </Group>
            </>
          )}

          {step === "review" && (
            <div className="grid gap-4">
              {duplicate && (
                <div className="rounded-xl border border-accent/50 bg-accent/10 p-4 text-sm">
                  <p className="flex items-center gap-2 font-semibold text-[#8a5a10]"><AlertTriangle className="h-4 w-4" /> {duplicate.message}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <Link href={`/app/individuals/${duplicate.id}`} target="_blank" className="inline-flex items-center gap-1 font-semibold text-brand">Open their record <ExternalLink className="h-3.5 w-3.5" /></Link>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={allowDuplicate} onChange={e => setAllowDuplicate(e.target.checked)} /> This is a different person, add them anyway</label>
                  </div>
                </div>
              )}
              <Summary title="Who they are" step="basics" onEdit={go}>
                <Facts rows={[
                  ["Name", `${person.firstName} ${person.lastName}`],
                  ["Likes to be called", person.preferredName],
                  ["Date of birth", person.dob ? `${person.dob}${age !== null ? ` (${age})` : ""}` : ""],
                  ["Gender", [person.gender, person.pronouns].filter(Boolean).join(", ")],
                  ["Main language", person.primaryLanguage],
                  ["Service", services[person.serviceType]],
                  ["Home", homeName ?? "Not in one of our homes"],
                  ["Support started", person.admittedAt],
                ]} />
              </Summary>
              <Summary title="Daily life" step="living" onEdit={go}>
                <Facts rows={[["Communication", person.communication], ["Mobility", person.mobility], ["Diet", person.diet], ["Likes", person.likes], ["How to support them", person.supportNotes]]} />
              </Summary>
              <Summary title="Health and medication" step="health" onEdit={go}>
                <Facts rows={[["Allergies", person.allergies || "None known"], ["Diagnoses", person.diagnoses]]} />
                {medications.length > 0 && (
                  <ul className="mt-3 grid gap-1 border-t border-line pt-3">
                    {medications.map((med, i) => <li key={i}><span className="font-semibold">{med.name}</span> {med.dose} {med.route} <span className="text-mute">at {splitTimes(med.times).join(", ")}</span></li>)}
                  </ul>
                )}
              </Summary>
              <Summary title="Family and care team" step="contacts" onEdit={go}>
                <Facts rows={[["Guardian", [person.guardianName, person.guardianPhone].filter(Boolean).join(" · ")], ["Emergency contact", [person.emergencyContact, person.emergencyPhone].filter(Boolean).join(" · ")]]} empty="No guardian or emergency contact added." />
                {contacts.length > 0 && (
                  <ul className="mt-3 grid gap-1 border-t border-line pt-3">
                    {contacts.map((c, i) => <li key={i}><span className="text-mute">{c.role}:</span> <span className="font-semibold">{c.name}</span>{c.organization ? `, ${c.organization}` : ""} {c.phone && <span className="text-mute">· {c.phone}</span>}</li>)}
                  </ul>
                )}
              </Summary>
              <Summary title="Insurance" step="insurance" onEdit={go}>
                {insurance.length ? (
                  <ul className="grid gap-1">{insurance.map((c, i) => <li key={i}><span className="capitalize text-mute">{c.rank}:</span> <span className="font-semibold">{c.payer}</span> ({c.kind}) · member {c.memberId}</li>)}</ul>
                ) : <p className="text-mute">None added. You can add insurance later on their Care team tab.</p>}
              </Summary>
              <Summary title="Plan goals" step="goals" onEdit={go}>
                {goals.length ? (
                  <ul className="grid gap-2">{goals.map((g, i) => <li key={i}><p className="font-semibold">{g.title}</p><p className="text-xs text-mute">{[g.measurableStep, g.frequencyCount ? `${g.frequencyCount} per ${g.frequencyPeriod}` : "", g.documentedOn].filter(Boolean).join(" · ")}</p></li>)}</ul>
                ) : <p className="text-mute">None added. You can add goals later on their Care plan tab.</p>}
              </Summary>
              <Summary title="Daily notes" step="notes" onEdit={go}>
                <p>
                  <span className="text-mute">Sections on: </span>
                  {SECTION_KEYS.filter(key => sectionNow(key).on).map(key => `${OPTIONAL_SECTIONS[key].title}${sectionNow(key).required ? " (must fill in)" : ""}`).join(", ") || "Core note only"}
                </p>
                {items.length > 0 && <p className="mt-1"><span className="text-mute">Extra questions: </span>{items.map(row => row.label).join(", ")}</p>}
              </Summary>
            </div>
          )}

          {(problem || serverError) && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#a1361f]/30 bg-[#a1361f]/5 px-4 py-3 text-sm text-[#a1361f]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{problem ?? serverError}</span>
              {serverError && errorStep && step !== errorStep && <button type="button" onClick={() => go(errorStep)} className="font-semibold underline">Go to it</button>}
            </div>
          )}
        </div>

        <footer className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          {index > 0 ? (
            <button type="button" onClick={() => go(STEPS[index - 1].key)} className="btn-ghost">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <span className="text-xs text-dim">Only first and last name are needed. Everything else can be added later.</span>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {step !== "review" && index >= 1 && (
              <button type="button" onClick={() => go("review")} className="text-sm font-semibold text-mute hover:text-ink">
                Skip to review
              </button>
            )}
            {step === "review" ? (
              <button type="submit" disabled={pending || (Boolean(duplicate) && !allowDuplicate)} className="btn-brand">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Add {person.firstName || "person"}
              </button>
            ) : (
              <button type="submit" className="btn-brand">
                Next: {STEPS[index + 1].title} <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </footer>
      </div>
    </form>
  );
}
