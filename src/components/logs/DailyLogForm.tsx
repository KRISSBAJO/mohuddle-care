"use client";

import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, Info, PenLine, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/format";
import { ADL_EXTRA, GOAL_OFFERED, GOAL_OUTCOME, INTAKE, MEALS, SLEEP_QUALITY, shiftMinutes } from "@/lib/log-note";
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
  goals: { id: string; title: string; description: string }[];
  homeId: string | null;
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
};

const MOODS = [
  ["great", "Great"],
  ["good", "Good"],
  ["okay", "Okay"],
  ["low", "Low"],
  ["distressed", "Distressed"],
] as const;

const SECTIONS = [
  ["shift", "Shift details"],
  ["mood", "Mood and presentation"],
  ["checks", "Required checks"],
  ["care", "Personal care"],
  ["meals", "Meals and fluids"],
  ["sleep", "Sleep and continence"],
  ["health", "Health and vitals"],
  ["goals", "Plan goals"],
  ["activities", "Activities and community"],
  ["behaviour", "Behaviour"],
  ["contacts", "Contacts and appointments"],
  ["summary", "Summary and signature"],
] as const;
type SectionId = (typeof SECTIONS)[number][0];

function Section({ id, index, title, hint, done, children }: { id: SectionId; index: number; title: string; hint?: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section id={`log-${id}`} className="card scroll-mt-24 p-5 sm:p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold", done ? "bg-sage text-white" : "bg-panel text-mute")}>{done ? <CheckCircle2 className="h-4 w-4" /> : index}</span>
        <div>
          <h2 className="font-display text-lg font-bold">{title}</h2>
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
  const [seizure, setSeizure] = useState(false);
  const [behaviour, setBehaviour] = useState(false);
  const [offered, setOffered] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  // Shift, mood and behaviour start filled in from their defaults; the rest fills as staff write.
  const [filled, setFilled] = useState<Set<SectionId>>(() => {
    const start = new Set<SectionId>(["mood", "behaviour"]);
    const chosen = people.find(option => option.id === props.initialPerson);
    if (chosen) start.add("shift");
    if (chosen && chosen.goals.length === 0) start.add("goals");
    return start;
  });

  const person = people.find(option => option.id === personId) ?? null;
  const scheduled = myShifts.find(option => option.id === shiftId) ?? null;
  const pattern = patterns.find(option => option.id === patternId) ?? null;
  const kind: Shift = scheduled ? scheduled.kind : times.start ? kindFor(times.start) : "day";
  const shiftName = scheduled ? scheduled.name : pattern ? pattern.name : "Unscheduled";
  const duplicate = person?.myRecentLogs.some(log => (scheduled ? log.shiftId === scheduled.id : !log.shiftId && log.logDate === logDate && log.shift === kind));
  const minutes = shiftMinutes(times.start, times.end);
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
    if (has("sleepHours") || has("sleepQuality") || has("bowelMovements") || has("incontinence")) next.add("sleep");
    if (["bpSys", "pulse", "temp", "weight", "pain", "health"].some(has) || data.get("seizure") === "on") next.add("health");
    if (person && (person.goals.length === 0 || person.goals.every(goal => has(`goal.${goal.id}.offered`)))) next.add("goals");
    if (data.getAll("activityTypes").length || has("activities")) next.add("activities");
    if (data.get("behaviourOccurred") === "on" ? has("behaviours") && has("intervention") : true) next.add("behaviour");
    if (has("familyContact") || has("appointments")) next.add("contacts");
    if (String(data.get("notes") ?? "").trim().length >= summaryMin && data.get("attest") === "on") next.add("summary");
    setFilled(next);
  }

  const completed = filled.size;
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
        <div className="flex gap-3 rounded-2xl border border-brand/20 bg-sky/60 px-5 py-4 text-sm text-brand-deep">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Write what you saw and heard, in plain words, using their name. Describe behaviour instead of labelling it: write &ldquo;pushed the plate away and said no&rdquo;, not &ldquo;was non-compliant&rdquo;.
            Guardians, nurses and state reviewers read these notes.
          </p>
        </div>

        <Section id="shift" index={1} title="Shift details" done={filled.has("shift")}>
          <input type="hidden" name="shiftId" value={scheduled?.id ?? ""} />
          <input type="hidden" name="shiftName" value={shiftName} />
          <input type="hidden" name="shift" value={kind} />
          {myShifts.length > 0 && (
            <div>
              <Label htmlFor="shiftPick">Your shift</Label>
              <select
                id="shiftPick"
                className="field"
                value={shiftId}
                onChange={event => {
                  const next = myShifts.find(option => option.id === event.target.value);
                  setShiftId(event.target.value);
                  if (next) {
                    setLogDate(next.day);
                    setTimes({ start: next.start, end: next.end });
                  }
                }}
              >
                {myShifts.map(option => (
                  <option key={option.id} value={option.id}>
                    {dayLabel(option.day)} · {option.name} {option.start}–{option.end} · {option.home}{option.current ? " (now)" : ""}
                  </option>
                ))}
                <option value="">Not on the schedule</option>
              </select>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="individualId">Person</Label>
              <select id="individualId" name="individualId" required className="field" value={personId} onChange={event => setPersonId(event.target.value)}>
                <option value="" disabled>Choose a person</option>
                {scheduled ? (
                  <>
                    <optgroup label={`Living at ${scheduled.home}`}>
                      {people.filter(option => option.homeId === scheduled.homeId).map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </optgroup>
                    <optgroup label="Everyone else">
                      {people.filter(option => option.homeId !== scheduled.homeId).map(option => <option key={option.id} value={option.id}>{option.name}{option.home ? ` · ${option.home}` : ""}</option>)}
                    </optgroup>
                  </>
                ) : (
                  people.map(option => <option key={option.id} value={option.id}>{option.name}{option.home ? ` · ${option.home}` : ""}</option>)
                )}
              </select>
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
              <select id="location" name="location" required className="field" defaultValue={props.locations[0]}>
                {props.locations.map(place => <option key={place}>{place}</option>)}
              </select>
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

        <Section id="mood" index={2} title="Mood and presentation" hint="Their mood overall, and how they seemed when you arrived." done={filled.has("mood")}>
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

        <Section id="checks" index={3} title="Required checks" hint="Every one must be confirmed. Coordinators set this list in Settings." done={filled.has("checks")}>
          <div className="grid gap-2 sm:grid-cols-2">
            {requiredChecks.map(item => (
              <label key={item} className="flex items-center gap-2.5 rounded-xl border border-line px-3.5 py-2.5 text-sm has-[:checked]:border-sage has-[:checked]:bg-sage-soft">
                <input type="checkbox" name="checks" value={item} className="h-4 w-4 accent-[#3e8e6a]" /> {item}
              </label>
            ))}
          </div>
        </Section>

        <Section id="care" index={4} title="Personal care" hint="How much help each task needed on this shift. Leave blank if it did not come up." done={filled.has("care")}>
          <div className="overflow-hidden rounded-xl border border-line">
            {adlItems.map((item, index) => (
              <div key={item} className="grid items-center gap-2 border-b border-line px-3.5 py-2.5 last:border-b-0 sm:grid-cols-[1fr_16rem]">
                <label htmlFor={`adl-${index}`} className="text-sm font-medium">{item}</label>
                <select id={`adl-${index}`} name={`adl.${index}`} className="field py-2" defaultValue="">
                  <option value="">—</option>
                  {levelOptions.map(level => <option key={level}>{level}</option>)}
                </select>
              </div>
            ))}
          </div>
        </Section>

        <Section id="meals" index={5} title="Meals and fluids" done={filled.has("meals")}>
          <div className="grid gap-3 sm:grid-cols-4">
            {MEALS.map(meal => (
              <div key={meal}>
                <Label htmlFor={`meal-${meal}`}>{meal}</Label>
                <select id={`meal-${meal}`} name={`meal.${meal}`} className="field py-2" defaultValue="">
                  <option value="">—</option>
                  {INTAKE.map(amount => <option key={amount}>{amount}</option>)}
                </select>
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

        <Section id="sleep" index={6} title="Sleep and continence" hint="Overnight staff fill in sleep. Everyone records bowel movements and incontinence." done={filled.has("sleep")}>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="sleepHours" optional>Hours slept</Label>
              <input id="sleepHours" name="sleepHours" type="number" min={0} max={24} step={0.5} inputMode="decimal" className="field" />
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="sleepQuality" optional>Sleep</Label>
              <select id="sleepQuality" name="sleepQuality" className="field" defaultValue="">
                <option value="">—</option>
                {SLEEP_QUALITY.map(quality => <option key={quality}>{quality}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="bowelMovements" optional>Bowel movements</Label>
              <input id="bowelMovements" name="bowelMovements" type="number" min={0} max={20} inputMode="numeric" className="field" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="incontinence" optional>Incontinence episodes</Label>
              <input id="incontinence" name="incontinence" type="number" min={0} max={30} inputMode="numeric" className="field" />
            </div>
          </div>
        </Section>

        <Section id="health" index={7} title="Health and vitals" hint="Only take vitals if their plan or the nurse asks for them." done={filled.has("health")}>
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
          <label className="flex items-center gap-2.5 rounded-xl border border-line px-3.5 py-2.5 text-sm has-[:checked]:border-flag has-[:checked]:bg-flag-soft">
            <input type="checkbox" name="seizure" checked={seizure} onChange={event => setSeizure(event.target.checked)} className="h-4 w-4 accent-[#c2412d]" /> Seizure activity on this shift
          </label>
          {seizure && (
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

        <Section id="goals" index={8} title="Plan goals" hint="Data for each goal in their Individual Support Plan. Reviewers check this against the plan." done={filled.has("goals")}>
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
                  <p className="font-semibold">{goal.title}</p>
                  {goal.description && <p className="text-sm text-mute">{goal.description}</p>}
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
                        <select id={`${key}-prompt`} name={`goal.${goal.id}.prompt`} required className="field py-2" defaultValue="">
                          <option value="" disabled>Choose</option>
                          {promptLevels.map(level => <option key={level}>{level}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor={`${key}-outcome`}>How it went</Label>
                        <select id={`${key}-outcome`} name={`goal.${goal.id}.outcome`} required className="field py-2" defaultValue="">
                          <option value="" disabled>Choose</option>
                          {Object.entries(GOAL_OUTCOME).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                        </select>
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

        <Section id="activities" index={9} title="Activities and community" done={filled.has("activities")}>
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

        <Section id="behaviour" index={10} title="Behaviour" hint="Record any behaviour named in their behaviour support plan, in order: before, during, response, after." done={filled.has("behaviour")}>
          <label className="flex items-center gap-2.5 rounded-xl border border-line px-3.5 py-2.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
            <input type="checkbox" name="behaviourOccurred" checked={behaviour} onChange={event => setBehaviour(event.target.checked)} className="h-4 w-4 accent-[#d39b2a]" /> A behaviour of concern happened on this shift
          </label>
          {behaviour && (
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

        <Section id="contacts" index={11} title="Contacts and appointments" done={filled.has("contacts")}>
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

        <Section id="summary" index={12} title="Summary and signature" done={filled.has("summary")}>
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
              Sections <span className="normal-case tracking-normal">{completed}/{SECTIONS.length}</span>
            </p>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-panel"><div className="h-full rounded-full bg-sage transition-all" style={{ width: `${(completed / SECTIONS.length) * 100}%` }} /></div>
            <ol className="grid gap-0.5 text-sm">
              {SECTIONS.map(([id, title]) => (
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
