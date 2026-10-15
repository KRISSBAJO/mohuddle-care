"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, Info, PenLine, ShieldAlert } from "lucide-react";
import { Select } from "@/components/app/Select";
import { DraftKeeper } from "@/components/app/DraftKeeper";
import { FollowUpQuestion } from "@/components/logs/FollowUpQuestion";
import { ScribePanel } from "@/components/logs/ScribePanel";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/format";
import { periodWord, type GoalProgress } from "@/lib/goal-progress";
import { ADL_EXTRA, GOAL_OFFERED, GOAL_OUTCOME, INTAKE, MEALS, SLEEP_QUALITY, STOOL_TYPES, dosesByHour, hourLabel, shiftHours, shiftMinutes, type ShiftDose } from "@/lib/log-note";
import type { NoteConfig, NoteItem, SectionKey } from "@/lib/note-requirements";
import type { ScribeDraft } from "@/lib/scribe";
import { isoWeekday, kindFor, type ShiftPattern } from "@/lib/schedule";
import { createDailyLog } from "@/server/actions/logs";
import type { FormState } from "@/server/actions/auth";

type Shift = "day" | "evening" | "overnight";
export type LogPerson = {
  id: string;
  name: string;
  home: string | null;
  allergies: string;
  supportNotes: string;
  goals: { id: string; title: string; description: string; measurableStep: string; setupNotes: string; workedToday: boolean; progress: GoalProgress }[];
  homeId: string | null;
  /* Doses due around now, for the hourly timeline. */
  doses: ShiftDose[];
  myRecentLogs: { shiftId: string | null; logDate: string; shift: Shift | null }[];
};

/* One of the writer's own recent shifts. */
export type MyShift = { id: string; homeId: string; home: string; kind: Shift; name: string; day: string; start: string; end: string; current: boolean };

type Props = {
  people: LogPerson[];
  initialPerson: string;
  initialShift: string;
  myShifts: MyShift[];
  patterns: ShiftPattern[];
  today: string;
  locations: string[];
  adlItems: string[];
  promptLevels: string[];
  activityTypes: string[];
  requiredChecks: string[];
  summaryMin: number;
  signer: string;
  /* Each person's note: which optional sections are on or required, and their extra items. */
  configs: Record<string, NoteConfig>;
  defaultConfig: NoteConfig;
  /* Whether staff can speak the note and have it drafted. */
  scribe: boolean;
  /* Where this device keeps an unsaved copy; includes the writer, so a shared tablet never shows it to someone else. */
  draftKey: string;
};

const MOODS = [
  ["great", "Great"],
  ["good", "Good"],
  ["okay", "Okay"],
  ["low", "Low"],
  ["distressed", "Distressed"],
] as const;

/* Every part a note can have, in order. Optional ones show only when switched on for the person. */
const SECTIONS = [
  ["shift", "Shift details"],
  ["mood", "Mood and presentation"],
  ["checks", "Required checks"],
  ["care", "Personal care"],
  ["meals", "Meals and fluids"],
  ["sleep", "Sleep"],
  ["continence", "Bowel and bladder"],
  ["health", "Health"],
  ["goals", "Plan goals"],
  ["activities", "Activities and community"],
  ["behaviour", "Behaviour"],
  ["contacts", "Contacts and appointments"],
  ["timeline", "Hourly timeline"],
  ["extra", "Extra items"],
  ["summary", "Summary and signature"],
] as const;
type SectionId = (typeof SECTIONS)[number][0];
const OPTIONAL: SectionId[] = ["care", "meals", "sleep", "continence", "activities", "behaviour", "contacts", "timeline"];

const SCOPE_BADGE = { all: "Everyone", home: "This home", person: "This person" } as const;

function Section({ id, index, title, hint, done, required, children }: { id: SectionId; index: number; title: string; hint?: string; done?: boolean; required?: string; children: React.ReactNode }) {
  return (
    <section id={`log-${id}`} className="card scroll-mt-24 p-5 sm:p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold", done ? "bg-sage text-white" : "bg-panel text-mute")}>{done ? <CheckCircle2 className="h-4 w-4" /> : index}</span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-bold">
            {title}
            {required && <span className="chip bg-sky px-2 py-0.5 font-sans text-[11px] text-brand-deep">{required}</span>}
          </h2>
          {hint && <p className="text-sm text-mute">{hint}</p>}
        </div>
      </header>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function Label({ htmlFor, children, optional }: { htmlFor?: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="label">
      {children}
      {optional && <span className="ml-1 font-normal normal-case tracking-normal text-dim">(if relevant)</span>}
    </label>
  );
}

const chip = "cursor-pointer rounded-full border border-line px-3.5 py-2 text-sm font-medium transition has-[:checked]:border-brand has-[:checked]:bg-sky has-[:checked]:text-brand-deep has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40";

/* A full shift note, in the shape reviewers expect from a Therap T-Log, with plan goal data and a signature. */
export function DailyLogForm(props: Props) {
  const { people, today, myShifts, patterns, adlItems, promptLevels, requiredChecks, summaryMin } = props;
  const form = useRef<HTMLFormElement>(null);
  const errorBox = useRef<HTMLParagraphElement>(null);
  const [personId, setPersonId] = useState(props.initialPerson);
  const [shiftId, setShiftId] = useState(props.initialShift);
  const firstShift = myShifts.find(option => option.id === props.initialShift);
  const [logDate, setLogDate] = useState(firstShift?.day ?? today);
  const firstPattern = patterns.find(option => option.weekdays.includes(isoWeekday(today))) ?? null;
  const [patternId, setPatternId] = useState<string>(firstPattern?.id ?? "custom");
  const [times, setTimes] = useState(() =>
    firstShift ? { start: firstShift.start, end: firstShift.end } : { start: firstPattern?.start ?? "", end: firstPattern?.end ?? "" },
  );
  const [seizure, setSeizure] = useState("");
  const [behaviour, setBehaviour] = useState("");
  const [offered, setOffered] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  // Shift, mood and behaviour start filled in from their defaults; the rest fills as staff write.
  const [filled, setFilled] = useState<Set<SectionId>>(() => {
    const start = new Set<SectionId>(["mood"]);
    const chosen = people.find(option => option.id === props.initialPerson);
    if (chosen) start.add("shift");
    if (chosen && chosen.goals.length === 0) start.add("goals");
    return start;
  });

  const person = people.find(option => option.id === personId) ?? null;
  const config = (person && props.configs[person.id]) || props.defaultConfig;
  const first = person?.name.split(" ")[0] ?? "this person";
  const isOn = (key: SectionKey) => config.sections[key].on;
  const mustFill = (key: SectionKey) => (config.sections[key].on && config.sections[key].required ? `Required for ${first}` : undefined);
  // The sections this person's note shows, numbered in order.
  const visible = SECTIONS.filter(([id]) => (OPTIONAL.includes(id) ? isOn(id as SectionKey) : id === "extra" ? config.items.length > 0 : true));
  const num = (id: SectionId) => visible.findIndex(([key]) => key === id) + 1;
  const scheduled = myShifts.find(option => option.id === shiftId) ?? null;
  const pattern = patterns.find(option => option.id === patternId) ?? null;
  const kind: Shift = scheduled ? scheduled.kind : times.start ? kindFor(times.start) : "day";
  const shiftName = scheduled ? scheduled.name : pattern ? pattern.name : "Unscheduled";
  const duplicate = person?.myRecentLogs.some(log => (scheduled ? log.shiftId === scheduled.id : !log.shiftId && log.logDate === logDate && log.shift === kind));
  const minutes = shiftMinutes(times.start, times.end);
  const hours = shiftHours(times.start, times.end);
  const hourDoses = person ? dosesByHour(person.doses, logDate, times.start, times.end) : {};
  const dayLabel = (day: string) => (day === today ? "Today" : `${fmt.weekday(day)} ${fmt.day(day)}`);

  const [state, action, pending] = useActionState<FormState, FormData>(async (previous, data) => {
    const result = await createDailyLog(previous, data);
    if (result.error) requestAnimationFrame(() => errorBox.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return result;
  }, {});

  /* Which sections have something in them, for the progress list. */
  function measure() {
    if (!form.current) return;
    const data = new FormData(form.current);
    const has = (name: string) => String(data.get(name) ?? "").trim() !== "";
    const any = (prefix: string) => [...data.entries()].some(([key, value]) => key.startsWith(prefix) && String(value).trim() !== "");
    const next = new Set<SectionId>();
    if (has("individualId") && has("timeIn") && has("timeOut") && has("location")) next.add("shift");
    if (has("mood")) next.add("mood");
    if (requiredChecks.every(item => data.getAll("checks").includes(item))) next.add("checks");
    if (any("adl.")) next.add("care");
    if (any("meal.") || has("fluidsOz") || has("meals")) next.add("meals");
    if (has("sleepHours") || has("sleepQuality") || has("sleepNotes")) next.add("sleep");
    if (has("bowelMovements") || has("incontinence") || has("stoolType")) next.add("continence");
    if (["bpSys", "pulse", "temp", "weight", "pain", "health", "seizureAnswer"].some(has)) next.add("health");
    if (person && (person.goals.length === 0 || person.goals.every(goal => has(`goal.${goal.id}.offered`)))) next.add("goals");
    if (data.getAll("activityTypes").length || has("activities")) next.add("activities");
    if (data.get("behaviourAnswer") === "no" || (data.get("behaviourAnswer") === "yes" && has("behaviours") && has("intervention"))) next.add("behaviour");
    if (has("familyContact") || has("appointments")) next.add("contacts");
    const hourNames = shiftHours(String(data.get("timeIn") ?? ""), String(data.get("timeOut") ?? "")).map(hour => `timeline.${hour}`);
    if (hourNames.length && (config.sections.timeline.required ? hourNames.every(has) : hourNames.some(has))) next.add("timeline");
    if (config.items.length && config.items.every(item => !item.required || has(`extra.${item.id}`) || data.getAll(`extra.${item.id}`).length > 0)) next.add("extra");
    if (String(data.get("notes") ?? "").trim().length >= summaryMin && data.get("attest") === "on") next.add("summary");
    setFilled(next);
  }

  useEffect(() => {
    const element = form.current;
    if (!element) return;
    const update = () => measure();
    element.addEventListener("select-change", update);
    return () => element.removeEventListener("select-change", update);
  });

  // A draft from the scribe waits one render, so sections it switches on (behaviour) exist before filling.
  const [draft, setDraft] = useState<ScribeDraft | null>(null);
  useEffect(() => {
    const element = form.current;
    if (!draft || !element) return;
    for (const [name, value] of Object.entries(draft)) {
      if (name === "notes" || name === "behaviourOccurred" || value === null || value === "") continue;
      if (name === "mood") {
        const radio = element.querySelector<HTMLInputElement>(`input[name="mood"][value="${value}"]`);
        if (radio) radio.checked = true;
        continue;
      }
      const field = element.elements.namedItem(name);
      // Only empty boxes are filled: anything staff already wrote stays.
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) || field.value.trim()) continue;
      field.value = String(value);
      field.classList.add("scribe-filled");
      field.addEventListener("input", () => field.classList.remove("scribe-filled"), { once: true });
    }
    setDraft(null);
    measure();
    // measure reads the form as it is now; it does not need to rerun this when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  function fillFromScribe(next: ScribeDraft) {
    if (next.behaviourOccurred) setBehaviour("yes");
    if (typeof next.notes === "string" && next.notes) setSummary(current => (current.trim() ? current : String(next.notes)));
    setDraft(next);
  }

  const completed = visible.filter(([id]) => filled.has(id)).length;
  const levelOptions = useMemo(() => [...promptLevels, ...ADL_EXTRA], [promptLevels]);

  return (
    <form
      ref={form}
      onChange={measure}
      onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]"
      noValidate={false}
    >
      <div className="grid gap-5">
        <DraftKeeper name={props.draftKey} />
        {props.scribe && <ScribePanel kind="daily" personId={person?.id ?? ""} personName={first === "this person" ? "" : first} onFill={fillFromScribe} />}
        <div className="flex gap-3 rounded-2xl border border-brand/20 bg-sky/60 px-5 py-4 text-sm text-brand-deep">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Write what you saw and heard, in plain words, using their name. Describe behaviour instead of labelling it: write &ldquo;pushed the plate away and said no&rdquo;, not &ldquo;was non-compliant&rdquo;.
            Guardians, nurses and state reviewers read these notes.
          </p>
        </div>

        <Section id="shift" index={num("shift")} title="Shift details" done={filled.has("shift")}>
          <input type="hidden" name="shiftId" value={scheduled?.id ?? ""} />
          <input type="hidden" name="shiftName" value={shiftName} />
          <input type="hidden" name="shift" value={kind} />
          {myShifts.length > 0 && (
            <div>
              <Label htmlFor="shiftPick">Your shift</Label>
              <Select
                id="shiftPick"
                value={shiftId}
                onChange={value => {
                  const next = myShifts.find(option => option.id === value);
                  setShiftId(value);
                  if (next) {
                    setLogDate(next.day);
                    setTimes({ start: next.start, end: next.end });
                  }
                }}
                options={[
                  ...myShifts.map(option => ({ value: option.id, label: `${dayLabel(option.day)} · ${option.name} ${option.start}–${option.end}${option.current ? " (now)" : ""}`, hint: option.home })),
                  { value: "", label: "Not on the schedule" },
                ]}
              />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="individualId">Person</Label>
              <Select
                id="individualId"
                name="individualId"
                required
                searchable
                placeholder="Search for a person"
                value={personId}
                onChange={setPersonId}
                options={
                  scheduled
                    ? [
                        ...people.filter(option => option.homeId === scheduled.homeId).map(option => ({ value: option.id, label: option.name, group: `Living at ${scheduled.home}` })),
                        ...people.filter(option => option.homeId !== scheduled.homeId).map(option => ({ value: option.id, label: option.name, hint: option.home ?? undefined, group: "Everyone else" })),
                      ]
                    : people.map(option => ({ value: option.id, label: option.name, hint: option.home ?? undefined }))
                }
              />
            </div>
            <div>
              <Label htmlFor="logDate">Date of the shift</Label>
              {scheduled ? (
                <>
                  <input type="hidden" name="logDate" value={scheduled.day} />
                  <p id="logDate" className="field bg-panel/60 text-mute">{fmt.dayLong(scheduled.day)}</p>
                </>
              ) : (
                <input id="logDate" name="logDate" type="date" required max={today} className="field" value={logDate} onChange={event => setLogDate(event.target.value)} />
              )}
            </div>
          </div>
          {!scheduled && (
            <fieldset>
              <legend className="label">Shift</legend>
              <div className="flex flex-wrap gap-2">
                {patterns.filter(option => option.weekdays.includes(isoWeekday(logDate || today))).map(option => (
                  <label key={option.id} className={chip}>
                    <input
                      type="radio"
                      name="patternPick"
                      value={option.id}
                      checked={patternId === option.id}
                      onChange={() => {
                        setPatternId(option.id);
                        setTimes({ start: option.start, end: option.end });
                      }}
                      className="sr-only"
                    />
                    {option.name} <span className="text-xs text-dim">{option.start}–{option.end}</span>
                  </label>
                ))}
                <label className={chip}>
                  <input type="radio" name="patternPick" value="custom" checked={patternId === "custom"} onChange={() => setPatternId("custom")} className="sr-only" /> Other times
                </label>
              </div>
              {myShifts.length === 0 && <p className="mt-1.5 text-xs text-mute">You have no shift on the schedule in the last day and a half, so choose the shift you worked.</p>}
            </fieldset>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="timeIn">You started</Label>
              <input id="timeIn" name="timeIn" type="time" required className="field" value={times.start} onChange={event => setTimes({ ...times, start: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="timeOut">You finished</Label>
              <input id="timeOut" name="timeOut" type="time" required className="field" value={times.end} onChange={event => setTimes({ ...times, end: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="location">Where</Label>
              <Select id="location" name="location" required defaultValue={props.locations[0]} options={props.locations.map(place => ({ value: place, label: place }))} />
            </div>
          </div>
          <p className="text-xs text-mute">
            {minutes !== null ? `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ""} of support${times.end < times.start ? ", past midnight" : ""}.` : "Enter both times."}
            {logDate < today && " Written after the day, so it will be marked as a late entry."}
          </p>
          {duplicate && (
            <p className="flex items-start gap-2 rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm text-[#8a5a10]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> You already wrote a note for {person?.name.split(" ")[0]} on this shift. Choose another person or shift, or open that note from their page.
            </p>
          )}
        </Section>

        <Section id="mood" index={num("mood")} title="Mood and presentation" hint="Their mood overall, and how they seemed when you arrived." done={filled.has("mood")}>
          <fieldset>
            <legend className="sr-only">Mood</legend>
            <div className="flex flex-wrap gap-2">
              {MOODS.map(([value, text]) => (
                <label key={value} className={chip}>
                  <input type="radio" name="mood" value={value} defaultChecked={value === "good"} className="sr-only" /> {text}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Label htmlFor="presentation" optional>How they seemed</Label>
            <input id="presentation" name="presentation" maxLength={500} className="field" placeholder="Awake and dressed, smiling, asked about lunch" />
          </div>
        </Section>

        <Section id="checks" index={num("checks")} title="Required checks" hint="Every one must be confirmed. Coordinators set this list in Settings." done={filled.has("checks")}>
          <div className="grid gap-2 sm:grid-cols-2">
            {requiredChecks.map(item => (
              <label key={item} className="flex items-center gap-2.5 rounded-xl border border-line px-3.5 py-2.5 text-sm has-[:checked]:border-sage has-[:checked]:bg-sage-soft">
                <input type="checkbox" name="checks" value={item} className="h-4 w-4 accent-[#3e8e6a]" /> {item}
              </label>
            ))}
          </div>
        </Section>

        {isOn("care") && (
        <Section id="care" index={num("care")} title="Personal care" required={mustFill("care")} hint={mustFill("care") ? "Choose a support level for every task, and add a note where it helps." : "How much help each task needed, and anything worth noting. Leave blank if it did not come up."} done={filled.has("care")}>
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="hidden grid-cols-[11rem_14rem_1fr] gap-3 border-b border-line bg-panel/60 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-mute md:grid">
              <span>Task</span><span>Support needed</span><span>Note</span>
            </div>
            {adlItems.map((item, index) => (
              <div key={item} className="grid items-center gap-2 border-b border-line px-3.5 py-2.5 last:border-b-0 md:grid-cols-[11rem_14rem_1fr] md:gap-3">
                <label htmlFor={`adl-${index}`} className="text-sm font-medium">{item}</label>
                <Select id={`adl-${index}`} name={`adl.${index}`} required={Boolean(mustFill("care"))} placeholder="—" emptyLabel="—" options={levelOptions.map(level => ({ value: level, label: level }))} />
                <input name={`adlNote.${index}`} maxLength={500} className="field py-2" placeholder="Note, for example needed help with buttons" aria-label={`Note on ${item}`} />
              </div>
            ))}
          </div>
        </Section>
        )}

        {isOn("meals") && (
        <Section id="meals" index={num("meals")} title="Meals and fluids" required={mustFill("meals")} done={filled.has("meals")}>
          <div className="grid gap-3 sm:grid-cols-4">
            {MEALS.map(meal => (
              <div key={meal}>
                <Label htmlFor={`meal-${meal}`}>{meal}</Label>
                <Select id={`meal-${meal}`} name={`meal.${meal}`} placeholder="—" emptyLabel="—" options={INTAKE.map(amount => ({ value: amount, label: amount }))} />
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <div>
              <Label htmlFor="fluidsOz" optional>Fluids (oz)</Label>
              <input id="fluidsOz" name="fluidsOz" type="number" min={0} max={400} inputMode="numeric" className="field" placeholder="48" />
            </div>
            <div>
              <Label htmlFor="meals" optional>Diet notes</Label>
              <input id="meals" name="meals" maxLength={1000} className="field" placeholder="Chopped diet followed. Declined the snack, had juice instead." />
            </div>
          </div>
        </Section>
        )}

        {isOn("sleep") && (
          <Section id="sleep" index={num("sleep")} title="Sleep" required={mustFill("sleep")} hint="Mostly for overnight staff. Leave blank if they were not asleep on your shift." done={filled.has("sleep")}>
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <Label htmlFor="sleepHours" optional>Hours slept</Label>
                <input id="sleepHours" name="sleepHours" type="number" min={0} max={24} step={0.5} inputMode="decimal" className="field" />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="sleepQuality" optional>How they slept</Label>
                <Select id="sleepQuality" name="sleepQuality" placeholder="—" emptyLabel="—" options={SLEEP_QUALITY.map(quality => ({ value: quality, label: quality }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="sleepNotes" optional>Night checks and notes</Label>
              <textarea id="sleepNotes" name="sleepNotes" rows={2} maxLength={1000} className="field" placeholder="Checked 01:00, 03:00 and 05:00, asleep each time. Repositioned at 03:00." />
            </div>
          </Section>
        )}

        {isOn("continence") && (
          <Section id="continence" index={num("continence")} title="Bowel and bladder" required={mustFill("continence")} hint="Enter 0 when there was no bowel movement on your shift." done={filled.has("continence")}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="bowelMovements">Bowel movements</Label>
                <input id="bowelMovements" name="bowelMovements" type="number" min={0} max={20} required={Boolean(mustFill("continence"))} inputMode="numeric" className="field" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="stoolType" optional>Stool type (Bristol chart)</Label>
                <Select id="stoolType" name="stoolType" placeholder="—" emptyLabel="—" options={STOOL_TYPES.map(type => ({ value: type, label: type }))} />
              </div>
              <div>
                <Label htmlFor="incontinence" optional>Incontinence episodes</Label>
                <input id="incontinence" name="incontinence" type="number" min={0} max={30} inputMode="numeric" className="field" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="continenceNotes" optional>Notes</Label>
                <input id="continenceNotes" name="continenceNotes" maxLength={1000} className="field" placeholder="Brief changed at 10:00 and 14:00, skin intact." />
              </div>
            </div>
          </Section>
        )}

        <Section
          id="health"
          index={num("health")}
          title="Health"
          required={mustFill("vitals") || mustFill("seizure")}
          hint={isOn("vitals") ? (mustFill("vitals") ? `Take ${first}'s blood pressure and pulse at least.` : "Take vitals if their plan or the nurse asks for them.") : "Anything a nurse should know."}
          done={filled.has("health")}
        >
          {isOn("vitals") && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            <div className="col-span-2 sm:col-span-2">
              <Label>Blood pressure</Label>
              <div className="flex items-center gap-1.5">
                <input name="bpSys" type="number" min={60} max={260} inputMode="numeric" className="field" placeholder="120" aria-label="Blood pressure, upper number" />
                <span className="text-mute">/</span>
                <input name="bpDia" type="number" min={30} max={160} inputMode="numeric" className="field" placeholder="80" aria-label="Blood pressure, lower number" />
              </div>
            </div>
            <div>
              <Label htmlFor="pulse">Pulse</Label>
              <input id="pulse" name="pulse" type="number" min={20} max={250} inputMode="numeric" className="field" placeholder="72" />
            </div>
            <div>
              <Label htmlFor="temp">Temp °F</Label>
              <input id="temp" name="temp" type="number" min={90} max={110} step={0.1} inputMode="decimal" className="field" placeholder="98.6" />
            </div>
            <div>
              <Label htmlFor="weight">Weight lb</Label>
              <input id="weight" name="weight" type="number" min={30} max={700} step={0.1} inputMode="decimal" className="field" />
            </div>
            <div>
              <Label htmlFor="pain">Pain 0–10</Label>
              <input id="pain" name="pain" type="number" min={0} max={10} inputMode="numeric" className="field" />
            </div>
          </div>
          )}
          {isOn("seizure") && (
            <fieldset className="rounded-xl border border-line px-4 py-3">
              <legend className="px-1 text-sm font-semibold">Any seizure activity on this shift?</legend>
              <div className="flex flex-wrap gap-2">
                {[["no", "No"], ["yes", "Yes"]].map(([value, text]) => (
                  <label key={value} className={cn(chip, "py-1.5", value === "yes" && "has-[:checked]:border-flag has-[:checked]:bg-flag-soft has-[:checked]:text-flag")}>
                    <input type="radio" name="seizureAnswer" value={value} required={Boolean(mustFill("seizure"))} checked={seizure === value} onChange={() => setSeizure(value)} className="sr-only" /> {text}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {isOn("seizure") && seizure === "yes" && (
            <div>
              <Label htmlFor="seizureNotes">Describe the seizure</Label>
              <textarea id="seizureNotes" name="seizureNotes" rows={3} required minLength={10} maxLength={3000} className="field" placeholder="Started 14:05, lasted about 90 seconds, right arm stiff then shaking. Rolled onto her side, timed it, called the nurse." />
            </div>
          )}
          <div>
            <Label htmlFor="health" optional>Health observations</Label>
            <textarea id="health" name="health" rows={3} maxLength={3000} className="field" placeholder="Skin check clear. Said her knee hurt on the stairs; nurse told." />
          </div>
        </Section>

        <Section id="goals" index={num("goals")} title="Plan goals" hint="Data for each goal in their Individual Support Plan. Reviewers check this against the plan." done={filled.has("goals")}>
          {!person ? (
            <p className="rounded-xl bg-panel px-4 py-3 text-sm text-mute">Choose a person to see their goals.</p>
          ) : person.goals.length === 0 ? (
            <p className="rounded-xl bg-panel px-4 py-3 text-sm text-mute">{person.name} has no active goals. A coordinator adds them on the Care plan tab.</p>
          ) : (
            person.goals.map(goal => {
              const choice = offered[goal.id] ?? "";
              const key = `goal-${goal.id.slice(0, 8)}`;
              return (
                <div key={goal.id} className={cn("rounded-xl border p-4", choice === "yes" ? "border-sage/50 bg-sage-soft/30" : "border-line")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold">{goal.title}</p>
                    <GoalCount progress={goal.progress} adding={choice === "yes" && !goal.workedToday} />
                  </div>
                  {goal.description && <p className="text-sm text-mute">{goal.description}</p>}
                  {goal.measurableStep && <p className="mt-1 text-sm"><span className="font-semibold">Step: </span>{goal.measurableStep}</p>}
                  {goal.setupNotes && <p className="mt-1 text-xs text-mute">For staff: {goal.setupNotes}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(GOAL_OFFERED).map(([value, text]) => (
                      <label key={value} className={cn(chip, "py-1.5")}>
                        <input type="radio" name={`goal.${goal.id}.offered`} value={value} required checked={choice === value} onChange={() => setOffered({ ...offered, [goal.id]: value })} className="sr-only" /> {text}
                      </label>
                    ))}
                  </div>
                  {choice === "yes" && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor={`${key}-prompt`}>Support needed</Label>
                        <Select id={`${key}-prompt`} name={`goal.${goal.id}.prompt`} required options={promptLevels.map(level => ({ value: level, label: level }))} />
                      </div>
                      <div>
                        <Label htmlFor={`${key}-outcome`}>How it went</Label>
                        <Select id={`${key}-outcome`} name={`goal.${goal.id}.outcome`} required options={Object.entries(GOAL_OUTCOME).map(([value, text]) => ({ value, label: text }))} />
                      </div>
                      <div>
                        <Label htmlFor={`${key}-attempts`} optional>Attempts</Label>
                        <input id={`${key}-attempts`} name={`goal.${goal.id}.attempts`} type="number" min={0} max={100} inputMode="numeric" className="field py-2" />
                      </div>
                      <div>
                        <Label htmlFor={`${key}-successes`} optional>Successful</Label>
                        <input id={`${key}-successes`} name={`goal.${goal.id}.successes`} type="number" min={0} max={100} inputMode="numeric" className="field py-2" />
                      </div>
                    </div>
                  )}
                  {choice && (
                    <div className="mt-3">
                      <Label htmlFor={`${key}-note`} optional>{choice === "yes" ? "What happened" : "Why"}</Label>
                      <input id={`${key}-note`} name={`goal.${goal.id}.note`} maxLength={1000} className="field py-2" placeholder={choice === "yes" ? "Paid at the till herself; needed one reminder to wait for change." : "Day program trip ran late."} />
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div>
            <Label htmlFor="goalProgress" optional>Other progress worth noting</Label>
            <input id="goalProgress" name="goalProgress" maxLength={2000} className="field" placeholder="Practised the bus route on his own initiative." />
          </div>
        </Section>

        {isOn("activities") && (
        <Section id="activities" index={num("activities")} title="Activities and community" required={mustFill("activities")} done={filled.has("activities")}>
          <div className="flex flex-wrap gap-2">
            {props.activityTypes.map(type => (
              <label key={type} className={cn(chip, "py-1.5")}>
                <input type="checkbox" name="activityTypes" value={type} className="sr-only" /> {type}
              </label>
            ))}
          </div>
          <div>
            <Label htmlFor="activities">What they did</Label>
            <textarea id="activities" name="activities" rows={3} maxLength={3000} className="field" placeholder="Where they went, who they saw, what choices they made, what they enjoyed." />
          </div>
        </Section>
        )}

        {isOn("behaviour") && (
        <Section id="behaviour" index={num("behaviour")} required={mustFill("behaviour")} title="Behaviour" hint="Record any behaviour named in their behaviour support plan, in order: before, during, response, after." done={filled.has("behaviour")}>
          <fieldset className="rounded-xl border border-line px-4 py-3">
            <legend className="px-1 text-sm font-semibold">Did a behaviour of concern happen on this shift?</legend>
            <div className="flex flex-wrap gap-2">
              {[["no", "No"], ["yes", "Yes"]].map(([value, text]) => (
                <label key={value} className={cn(chip, "py-1.5", value === "yes" && "has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-[#8a5a10]")}>
                  <input type="radio" name="behaviourAnswer" value={value} required={Boolean(mustFill("behaviour"))} checked={behaviour === value} onChange={() => setBehaviour(value)} className="sr-only" /> {text}
                </label>
              ))}
            </div>
          </fieldset>
          {behaviour === "yes" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="antecedent">What happened just before</Label>
                  <textarea id="antecedent" name="antecedent" rows={3} maxLength={2000} className="field" placeholder="Fire alarm test in the building; the hallway was loud." />
                </div>
                <div>
                  <Label htmlFor="behaviours">What you saw and heard</Label>
                  <textarea id="behaviours" name="behaviours" rows={3} required minLength={10} maxLength={3000} className="field" placeholder="Covered her ears, shouted 'stop', hit the wall twice with her open hand. About 4 minutes." />
                </div>
                <div>
                  <Label htmlFor="intervention">What staff did</Label>
                  <textarea id="intervention" name="intervention" rows={3} required minLength={5} maxLength={3000} className="field" placeholder="Offered the quiet room and her headphones, spoke calmly, gave space." />
                </div>
                <div>
                  <Label htmlFor="behaviourOutcome">How it ended</Label>
                  <textarea id="behaviourOutcome" name="behaviourOutcome" rows={3} maxLength={2000} className="field" placeholder="Calm after 10 minutes, rejoined the group for lunch." />
                </div>
              </div>
              <p className="flex items-start gap-2 rounded-xl bg-flag-soft px-3.5 py-2.5 text-sm text-flag">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  If anyone was hurt, a restraint was used, police were called, or there is any allegation of abuse or neglect, also{" "}
                  <Link href={`/app/incidents/new${personId ? `?individual=${personId}` : ""}`} target="_blank" className="font-semibold underline">report an incident</Link>.
                </span>
              </p>
            </>
          )}
        </Section>
        )}

        {isOn("contacts") && (
        <Section id="contacts" index={num("contacts")} title="Contacts and appointments" required={mustFill("contacts")} done={filled.has("contacts")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="familyContact" optional>Family or guardian contact</Label>
              <textarea id="familyContact" name="familyContact" rows={2} maxLength={1000} className="field" placeholder="Called her brother, 15 minutes. Asked about Sunday visit." />
            </div>
            <div>
              <Label htmlFor="appointments" optional>Appointments</Label>
              <textarea id="appointments" name="appointments" rows={2} maxLength={1000} className="field" placeholder="Dentist 10:30, cleaning done, next visit in 6 months." />
            </div>
          </div>
        </Section>
        )}

        {isOn("timeline") && (
          <Section id="timeline" index={num("timeline")} title="Hourly timeline" hint="A line for each hour you were with them. Doses due that hour show from the MAR." required={mustFill("timeline")} done={filled.has("timeline")}>
            {hours.length === 0 ? (
              <p className="rounded-xl bg-panel px-4 py-3 text-sm text-mute">Enter the start and finish times above to see the hours.</p>
            ) : (
              <ol className="divide-y divide-line/60 rounded-xl border border-line">
                {hours.map(hour => (
                  <li key={hour} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[4.5rem_1fr] sm:items-start">
                    <label htmlFor={`timeline-${hour}`} className="pt-2 text-sm font-semibold tabular-nums text-mute">{hourLabel(hour)}</label>
                    <div className="grid gap-1.5">
                      {hourDoses[hour]?.map(dose => (
                        <span key={dose} className="w-fit rounded-full bg-sky px-2.5 py-0.5 text-xs font-medium text-brand-deep">{dose}</span>
                      ))}
                      <input id={`timeline-${hour}`} name={`timeline.${hour}`} maxLength={500} required={config.sections.timeline.required} className="field py-2" placeholder={hour === hours[0] ? "Arrived, read handover, Sam was watching TV." : ""} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        )}

        {config.items.length > 0 && (
          <Section id="extra" index={num("extra")} title={`Extra items for ${first}`} hint="Set for this person, their home or everyone. Required ones must be answered." done={filled.has("extra")}>
            {config.items.map(item => (
              <ExtraField key={item.id} item={item} personId={personId} />
            ))}
          </Section>
        )}

        <Section id="summary" index={num("summary")} title="Summary and signature" done={filled.has("summary")}>
          <div>
            <Label htmlFor="notes">Shift summary</Label>
            <textarea
              id="notes"
              name="notes"
              rows={5}
              required
              minLength={summaryMin}
              maxLength={5000}
              className="field"
              value={summary}
              onChange={event => setSummary(event.target.value)}
              placeholder="How the shift went overall, what the next shift needs to know, and anything left to follow up."
            />
            <p className={cn("mt-1 text-xs", summary.trim().length >= summaryMin ? "text-sage" : "text-mute")}>
              {summary.trim().length} of at least {summaryMin} characters
            </p>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-line px-4 py-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-sky/60">
            <input type="checkbox" name="attest" required className="mt-0.5 h-4 w-4 accent-[#1d5a8c]" />
            <span>
              I confirm this note is accurate and written from my own observation on this shift. Signed electronically as <strong>{props.signer}</strong> when saved.
            </span>
          </label>
          {state.error && (
            <p ref={errorBox} className="rounded-xl bg-flag-soft px-3.5 py-2.5 text-sm font-medium text-flag" role="alert">{state.error}</p>
          )}
          <div className="flex justify-end">
            <button type="submit" disabled={pending} className="btn-brand disabled:opacity-60">
              <PenLine className="h-4 w-4" /> {pending ? "Saving…" : "Sign and save log"}
            </button>
          </div>
        </Section>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-4 grid gap-4">
          {person && (
            <div className="card p-4 text-sm">
              <p className="font-display font-bold">{person.name}</p>
              {person.home && <p className="text-xs text-mute">{person.home}</p>}
              <p className={cn("mt-2 rounded-lg px-2.5 py-1.5 text-xs", person.allergies ? "bg-flag-soft font-semibold text-flag" : "bg-panel text-mute")}>Allergies: {person.allergies || "none known"}</p>
              {person.supportNotes && <p className="mt-2 line-clamp-6 text-xs leading-relaxed text-mute">{person.supportNotes}</p>}
            </div>
          )}
          <nav className="card p-4" aria-label="Log sections">
            <p className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-mute">
              Sections <span className="normal-case tracking-normal">{completed}/{visible.length}</span>
            </p>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-panel"><div className="h-full rounded-full bg-sage transition-all" style={{ width: `${(completed / visible.length) * 100}%` }} /></div>
            <ol className="grid gap-0.5 text-sm">
              {visible.map(([id, title]) => (
                <li key={id}>
                  <a href={`#log-${id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-mute hover:bg-panel hover:text-ink">
                    {filled.has(id) ? <CheckCircle2 className="h-4 w-4 text-sage" /> : <Circle className="h-4 w-4 text-line" />} {title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          {state.error && <p className="rounded-xl bg-flag-soft px-3.5 py-2.5 text-xs font-medium text-flag">{state.error}</p>}
        </div>
      </aside>
    </form>
  );
}

/* One extra question, drawn by its answer type. */
/* "Documented 1 of 3 this week", turning green once the plan's count is reached. Choosing
   "Worked on it" shows what this note brings it to; a second note on the same day adds no day. */
function GoalCount({ progress, adding }: { progress: GoalProgress; adding: boolean }) {
  const count = progress.count + (adding ? 1 : 0);
  const met = progress.target !== null && count >= progress.target;
  const text = progress.target === null ? `Worked on ${count} ${count === 1 ? "time" : "times"} ${periodWord[progress.period]}` : `Documented ${count} of ${progress.target} ${periodWord[progress.period]}`;
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums", met ? "bg-sage-soft text-sage" : progress.target === null ? "bg-panel text-mute" : "bg-[#fdf3e1] text-[#8a5a10]")}>
      {text}
      {adding && <span className="font-normal"> with this note</span>}
    </span>
  );
}

function ExtraField({ item, personId }: { item: NoteItem; personId: string }) {
  const name = `extra.${item.id}`;
  const id = `extra-${item.id.slice(0, 8)}`;
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label htmlFor={item.fieldType === "yes_no" || item.fieldType === "multi" ? undefined : id} className="text-sm font-semibold">{item.label}</label>
        <span className="chip bg-panel px-2 py-0 text-[10px] text-mute">{SCOPE_BADGE[item.scope]}</span>
        {item.required && <span className="chip bg-sky px-2 py-0 text-[10px] text-brand-deep">Required</span>}
      </div>
      {item.help && <p className="-mt-1 mb-2 text-xs text-mute">{item.help}</p>}
      {item.fieldType === "yes_no" && item.followUpOn && <FollowUpQuestion item={item} chip={chip} individualId={personId || null} />}
      {item.fieldType === "yes_no" && !item.followUpOn && (
        <div className="flex gap-2">
          {["Yes", "No"].map(value => (
            <label key={value} className={cn(chip, "py-1.5")}>
              <input type="radio" name={name} value={value} required={item.required} className="sr-only" /> {value}
            </label>
          ))}
        </div>
      )}
      {item.fieldType === "number" && (
        <div className="flex max-w-xs items-center gap-2">
          <input id={id} name={name} type="number" step="any" required={item.required} inputMode="decimal" className="field" />
          {item.unit && <span className="text-sm text-mute">{item.unit}</span>}
        </div>
      )}
      {item.fieldType === "choice" && (
        <Select id={id} name={name} required={item.required} className="max-w-md" placeholder="—" emptyLabel="—" options={item.options.map(option => ({ value: option, label: option }))} />
      )}
      {item.fieldType === "multi" && (
        <div className="flex flex-wrap gap-2">
          {item.options.map(option => (
            <label key={option} className={cn(chip, "py-1.5")}>
              <input type="checkbox" name={name} value={option} className="sr-only" /> {option}
            </label>
          ))}
        </div>
      )}
      {item.fieldType === "text" && <textarea id={id} name={name} rows={2} required={item.required} maxLength={2000} className="field" />}
    </div>
  );
}
