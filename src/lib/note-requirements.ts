/*
 * What a daily note asks for. Every note has the core parts (shift, mood, checks, plan goals, summary,
 * signature). The optional sections and extra items are set agency-wide, then per home, then per person:
 * a person's setting beats their home's, which beats the agency default.
 */

export const OPTIONAL_SECTIONS = {
  care: { title: "Personal care", hint: "Support level and a note for each personal care task." },
  meals: { title: "Meals and fluids", hint: "How much was eaten at each meal, fluids and diet notes." },
  sleep: { title: "Sleep", hint: "Hours slept, how well, and night checks." },
  continence: { title: "Bowel and bladder", hint: "Bowel movements, stool type and incontinence episodes." },
  vitals: { title: "Vital signs", hint: "Blood pressure, pulse, temperature, weight and pain." },
  seizure: { title: "Seizure watch", hint: "Whether any seizure activity happened, and a full description if so." },
  activities: { title: "Activities and community", hint: "Activity types and what they did." },
  behaviour: { title: "Behaviour", hint: "Before, during, staff response and after, for any behaviour of concern." },
  contacts: { title: "Contacts and appointments", hint: "Family or guardian contact and appointments." },
} as const;
export type SectionKey = keyof typeof OPTIONAL_SECTIONS;
export const SECTION_KEYS = Object.keys(OPTIONAL_SECTIONS) as SectionKey[];

/* On by default for every note until an admin changes it. */
export const DEFAULT_ON: SectionKey[] = ["care", "meals", "sleep", "activities", "behaviour", "contacts"];

export const FIELD_TYPES = {
  yes_no: "Yes or no",
  number: "Number",
  choice: "Pick one",
  multi: "Pick any",
  text: "Written note",
} as const;
export type FieldType = keyof typeof FIELD_TYPES;

export type Scope = "all" | "home" | "person";
export const SCOPE_RANK: Record<Scope, number> = { all: 0, home: 1, person: 2 };

/* A stored requirement row, as the rules below need it. */
export type RequirementRow = {
  id: string;
  scope: Scope;
  kind: "section" | "item";
  section: string;
  enabled: boolean;
  required: boolean;
  label: string;
  fieldType: string;
  options: string[];
  unit: string;
  help: string;
  sortOrder: number;
};

export type NoteItem = { id: string; label: string; fieldType: FieldType; options: string[]; unit: string; help: string; required: boolean; scope: Scope };
export type SectionState = { on: boolean; required: boolean; from: Scope | "default" };
export type NoteConfig = { sections: Record<SectionKey, SectionState>; items: NoteItem[] };

/* The note a person gets, from the rows that apply to them: agency-wide, their home's and their own. */
export function effectiveConfig(rows: RequirementRow[]): NoteConfig {
  const sections = Object.fromEntries(SECTION_KEYS.map(key => [key, { on: DEFAULT_ON.includes(key), required: false, from: "default" as const }])) as Record<SectionKey, SectionState>;
  const ordered = [...rows].sort((a, b) => SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope]);
  for (const row of ordered) {
    if (row.kind !== "section" || !(row.section in OPTIONAL_SECTIONS)) continue;
    sections[row.section as SectionKey] = { on: row.enabled, required: row.enabled && row.required, from: row.scope };
  }
  const items = ordered
    .filter(row => row.kind === "item" && row.enabled && row.fieldType in FIELD_TYPES)
    .sort((a, b) => SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope] || a.sortOrder - b.sortOrder)
    .map(row => ({ id: row.id, label: row.label, fieldType: row.fieldType as FieldType, options: row.options, unit: row.unit, help: row.help, required: row.required, scope: row.scope }));
  return { sections, items };
}

export type ExtraAnswer = { id: string; label: string; value: string | string[]; unit: string; scope: Scope };

/* Reads and checks the answers to extra items. Returns the answers, or the first problem in a sentence. */
export function readExtraItems(items: NoteItem[], get: (name: string) => string, getAll: (name: string) => string[]): { answers: ExtraAnswer[] } | { error: string } {
  const answers: ExtraAnswer[] = [];
  for (const item of items) {
    const name = `extra.${item.id}`;
    let value: string | string[];
    if (item.fieldType === "multi") {
      value = getAll(name).filter(option => item.options.includes(option));
      if (item.required && value.length === 0) return { error: `Answer "${item.label}".` };
    } else {
      value = get(name).trim();
      if (item.required && !value) return { error: `Answer "${item.label}".` };
      if (value && item.fieldType === "number" && !Number.isFinite(Number(value))) return { error: `"${item.label}" must be a number.` };
      if (value && item.fieldType === "yes_no" && value !== "Yes" && value !== "No") return { error: `Answer "${item.label}" with yes or no.` };
      if (value && item.fieldType === "choice" && !item.options.includes(value)) return { error: `Choose one of the options for "${item.label}".` };
      if (value.length > 2000) return { error: `Keep "${item.label}" under 2,000 characters.` };
    }
    if (value.length) answers.push({ id: item.id, label: item.label, value, unit: item.unit, scope: item.scope });
  }
  return { answers };
}
