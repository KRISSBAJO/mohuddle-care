import { Check } from "lucide-react";
import { ModalForm } from "@/components/app/ModalForm";
import { Badge, Empty, Field, Panel } from "@/components/app/ui";
import { fmt, label, labels } from "@/lib/format";
import { completeTask, createTask } from "@/server/actions/hub";
import { requestTime } from "@/server/clock";
import type { schema } from "@/server/db";
import { listStaff } from "@/server/queries/hub";
import { personTasks } from "@/server/queries/person";

type Person = typeof schema.individuals.$inferSelect;
const priorityTone = { low: "neutral", normal: "brand", high: "bad" } as const;

/* Follow-ups for this person: appointments to book, paperwork, things to buy. */
export async function PersonTasksTab({ id, person }: { id: string; person: Person }) {
  const [tasks, staff, now] = await Promise.all([personTasks(id), listStaff(), requestTime()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Tasks for {person.firstName}</h2>
          <p className="text-sm text-mute">Appointments to book, paperwork, follow-ups. They also show on the main task list.</p>
        </div>
        <ModalForm action={createTask} title={`Add a task for ${person.firstName}`} triggerLabel="Add task" submitLabel="Add task">
          <input type="hidden" name="individualId" value={id} />
          <input type="hidden" name="homeId" value={person.homeId ?? ""} />
          <Field label="Task" htmlFor="person-task-title"><input id="person-task-title" name="title" required minLength={3} maxLength={160} className="field" placeholder="Book the annual dental check-up" /></Field>
          <Field label="Details" htmlFor="person-task-details"><textarea id="person-task-details" name="details" rows={2} maxLength={2000} className="field" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Assign to" htmlFor="person-task-assignee">
              <select id="person-task-assignee" name="assignedTo" className="field" defaultValue="">
                <option value="">Unassigned</option>
                {staff.map(member => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}
              </select>
            </Field>
            <Field label="Priority" htmlFor="person-task-priority">
              <select id="person-task-priority" name="priority" className="field" defaultValue="normal">
                {Object.entries(labels.taskPriority).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Due" htmlFor="person-task-due"><input id="person-task-due" name="dueAt" type="datetime-local" className="field" /></Field>
        </ModalForm>
      </div>

      <Panel title={`Open (${tasks.open.length})`}>
        {tasks.open.length === 0 ? (
          <Empty>Nothing to follow up.</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {tasks.open.map(task => {
              const overdue = task.dueAt && task.dueAt.getTime() < now;
              return (
                <li key={task.id} className="flex items-start gap-3 px-5 py-3.5">
                  <form action={completeTask.bind(null, task.id)} className="no-print">
                    <button className="group mt-0.5 grid h-6 w-6 place-items-center rounded-full border-2 border-line hover:border-sage hover:bg-sage-soft" aria-label={`Mark ${task.title} done`}>
                      <Check className="h-3.5 w-3.5 text-transparent group-hover:text-sage" />
                    </button>
                  </form>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {task.title}
                      <Badge tone={priorityTone[task.priority]}>{label("taskPriority", task.priority)}</Badge>
                      {overdue && <Badge tone="bad">Overdue</Badge>}
                    </p>
                    {task.details && <p className="text-sm text-mute">{task.details}</p>}
                    <p className="mt-0.5 text-xs text-dim">{[task.assignee ?? "Unassigned", task.dueAt ? `due ${fmt.dateTime(task.dueAt)}` : "no due date", `added ${fmt.day(task.createdAt)}`].join(" · ")}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Recently done">
        {tasks.done.length === 0 ? (
          <Empty>No finished tasks yet.</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {tasks.done.map(task => (
              <li key={task.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sage-soft text-sage"><Check className="h-3.5 w-3.5" /></span>
                <div>
                  <p className="font-semibold">{task.title}</p>
                  <p className="text-xs text-dim">{[task.assignee, task.completedAt ? `done ${fmt.dateTime(task.completedAt)}` : null].filter(Boolean).join(" · ")}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
