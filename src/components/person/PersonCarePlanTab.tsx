import { CheckCircle2, CirclePause, Target } from "lucide-react";
import { ModalForm } from "@/components/app/ModalForm";
import { Select } from "@/components/app/Select";
import { Badge, Empty, Field, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { dateKey, daysBetween, fmt } from "@/lib/format";
import { goalProgress } from "@/lib/goal-progress";
import { addGoal, setGoalStatus, updateGoal } from "@/server/actions/hub";
import type { schema } from "@/server/db";
import { personCarePlan } from "@/server/queries/person";
import { configAbove, requirementsAt } from "@/server/queries/note-requirements";
import { NoteRequirementsEditor } from "@/components/logs/NoteRequirementsEditor";

type Person = typeof schema.individuals.$inferSelect;
type Goal = typeof schema.planGoals.$inferSelect;

const sections = [
  ["active", "Working on now", Target, "brand"],
  ["paused", "Paused", CirclePause, "neutral"],
  ["met", "Met", CheckCircle2, "good"],
] as const;

function GoalFields({ goal, prefix }: { goal?: Goal; prefix: string }) {
  return (
    <>
      <Field label="Goal" htmlFor={`${prefix}-title`}>
        <input id={`${prefix}-title`} name="title" required minLength={3} maxLength={160} className="field" defaultValue={goal?.title} placeholder="Ride the bus to day program independently" />
      </Field>
      <Field label="Details" htmlFor={`${prefix}-description`} hint="What success looks like and how staff help.">
        <textarea id={`${prefix}-description`} name="description" rows={3} maxLength={1000} className="field" defaultValue={goal?.description} />
      </Field>
      <Field label="Measurable step" htmlFor={`${prefix}-step`} hint="What staff look for each time.">
        <input id={`${prefix}-step`} name="measurableStep" maxLength={500} className="field" defaultValue={goal?.measurableStep} placeholder="Pays at the till with one verbal prompt or fewer" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[7rem_1fr_1fr]">
        <Field label="How often" htmlFor={`${prefix}-count`}>
          <input id={`${prefix}-count`} name="frequencyCount" type="number" min={1} max={31} inputMode="numeric" className="field" defaultValue={goal?.frequencyCount ?? ""} placeholder="3" />
        </Field>
        <Field label="Per" htmlFor={`${prefix}-period`}>
          <Select id={`${prefix}-period`} name="frequencyPeriod" defaultValue={goal?.frequencyPeriod ?? "week"} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
        </Field>
        <Field label="Target date" htmlFor={`${prefix}-target`}>
          <input id={`${prefix}-target`} name="targetDate" type="date" className="field" defaultValue={goal?.targetDate ?? ""} />
        </Field>
      </div>
      <Field label="Note for staff" htmlFor={`${prefix}-setup`} hint="Set-up, materials or how to prompt.">
        <textarea id={`${prefix}-setup`} name="setupNotes" rows={2} maxLength={1000} className="field" defaultValue={goal?.setupNotes} />
      </Field>
    </>
  );
}

/* The person's plan goals, grouped by where they stand, next to what staff wrote about progress. */
export async function PersonCarePlanTab({ id, person, manager }: { id: string; person: Person; manager: boolean }) {
  const [{ goals, progress, logsLast30, worked }, noteRows, homeNote] = await Promise.all([personCarePlan(id), requirementsAt("person", id), configAbove(person.homeId)]);
  const today = dateKey();

  return (
    <div className="space-y-8">
    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">Plan goals</h2>
            <p className="text-sm text-mute">
              {goals.filter(goal => goal.status === "active").length} in progress, {goals.filter(goal => goal.status === "met").length} met. Write goals in {person.firstName}&apos;s own words where you can.
            </p>
          </div>
          {person.active && (
            <ModalForm action={addGoal} title="Add a plan goal" description="Write it in the person's own words where you can." triggerLabel="Add goal" submitLabel="Add goal">
              <input type="hidden" name="individualId" value={id} />
              <GoalFields prefix="add-goal" />
            </ModalForm>
          )}
        </div>

        {goals.length === 0 && (
          <Panel>
            <Empty>No goals yet. Add the outcomes from {person.firstName}&apos;s Individual Support Plan.</Empty>
          </Panel>
        )}

        {sections.map(([status, title, Icon, tone]) => {
          const list = goals.filter(goal => goal.status === status);
          if (!list.length) return null;
          return (
            <section key={status}>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-mute">
                <Icon className="h-3.5 w-3.5" /> {title} <span className="text-dim">({list.length})</span>
              </h3>
              <ul className="grid gap-3 md:grid-cols-2">
                {list.map(goal => {
                  const left = goal.targetDate ? daysBetween(today, goal.targetDate) : null;
                  const overdue = status === "active" && left !== null && left < 0;
                  return (
                    <li key={goal.id} className={cn("card flex flex-col p-4", overdue && "ring-2 ring-accent/50", status === "met" && "opacity-80")}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold">{goal.title}</p>
                        <Badge tone={tone}>{status === "active" ? "Active" : status === "met" ? "Met" : "Paused"}</Badge>
                      </div>
                      {goal.description && <p className="mt-1 whitespace-pre-line text-sm text-mute">{goal.description}</p>}
                      {goal.measurableStep && <p className="mt-1 text-sm"><span className="font-semibold">Step: </span>{goal.measurableStep}</p>}
                      {status === "active" && goal.frequencyCount && (() => {
                        const done = goalProgress(worked.filter(row => row.goalId === goal.id).map(row => row.day), goal.frequencyCount, goal.frequencyPeriod, today);
                        return <p className={cn("mt-2 w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums", done.met ? "bg-sage-soft text-sage" : "bg-[#fdf3e1] text-[#8a5a10]")}>{done.label}</p>;
                      })()}
                      <p className={cn("mt-2 text-xs", overdue ? "font-semibold text-[#8a5a10]" : "text-dim")}>
                        {goal.targetDate
                          ? `Target ${fmt.dayLong(goal.targetDate)}${status === "active" && left !== null ? (left < 0 ? ` · ${-left} days past` : left === 0 ? " · today" : ` · ${left} days left`) : ""}`
                          : "No target date"}
                        {` · added ${fmt.day(goal.createdAt)}`}
                      </p>
                      {person.active && (
                        <div className="no-print mt-auto flex flex-wrap items-center gap-3 border-t border-line pt-3 text-xs">
                          {status === "active" && <form action={setGoalStatus.bind(null, goal.id, id, "met")}><button className="font-semibold text-sage">Mark met</button></form>}
                          {status === "active" && <form action={setGoalStatus.bind(null, goal.id, id, "paused")}><button className="font-semibold text-mute hover:text-ink">Pause</button></form>}
                          {status !== "active" && <form action={setGoalStatus.bind(null, goal.id, id, "active")}><button className="font-semibold text-brand">{status === "met" ? "Reopen" : "Resume"}</button></form>}
                          <span className="ml-auto">
                            <ModalForm action={updateGoal.bind(null, goal.id)} title="Edit goal" triggerLabel="Edit" triggerIcon="pencil" triggerTone="ghost" submitLabel="Save goal">
                              <GoalFields goal={goal} prefix={`goal-${goal.id.slice(0, 8)}`} />
                            </ModalForm>
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <Panel title="Progress notes from daily logs">
        {progress.length === 0 ? (
          <Empty>No progress notes yet. Staff add them in the goal progress box of each daily log.</Empty>
        ) : (
          <ol className="divide-y divide-line/60">
            {progress.map(note => (
              <li key={note.id} className="px-5 py-3">
                <p className="text-xs font-semibold text-mute">{fmt.dayLong(note.day)}{note.staff ? ` · ${note.staff}` : ""}</p>
                <p className="mt-0.5 whitespace-pre-line text-sm">{note.text}</p>
              </li>
            ))}
          </ol>
        )}
        <p className="border-t border-line px-5 py-2.5 text-xs text-dim">{logsLast30} daily logs written in the last 30 days.</p>
      </Panel>
    </div>

    <section>
      <h2 className="text-xl font-bold">What daily notes must cover for {person.firstName}</h2>
      <p className="mb-4 text-sm text-mute">
        Turn on sections such as bowel and bladder or seizure watch just for {person.firstName}, or add questions only their notes ask. Home and agency settings apply too.
      </p>
      <NoteRequirementsEditor scope="person" targetId={id} name={person.firstName} above={homeNote} rows={noteRows} manager={manager} />
    </section>
    </div>
  );
}
