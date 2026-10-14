import { Check } from "lucide-react";
import { ModalForm } from "@/components/app/ModalForm";
import { Badge, Empty, Panel } from "@/components/app/ui";
import { fmt, label } from "@/lib/format";
import { addTask, finishTask } from "@/server/actions/tasks";
import { TaskCheck } from "@/components/tasks/TaskCheck";
import { TaskFields } from "@/components/tasks/TaskParts";
import Link from "next/link";
import { getSettings } from "@/server/settings";
import { listHomes, listIndividuals } from "@/server/queries/hub";
import { requestTime } from "@/server/clock";
import type { schema } from "@/server/db";
import { listStaff } from "@/server/queries/hub";
import { personTasks } from "@/server/queries/person";

type Person = typeof schema.individuals.$inferSelect;
const priorityTone = { low: "neutral", normal: "brand", high: "bad" } as const;

/* Follow-ups for this person: appointments to book, paperwork, things to buy. */
export async function PersonTasksTab({ id, person }: { id: string; person: Person }) {
  const [tasks, staff, now, settings, people, homes] = await Promise.all([personTasks(id), listStaff(), requestTime(), getSettings(), listIndividuals(), listHomes()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Tasks for {person.firstName}</h2>
          <p className="text-sm text-mute">Appointments to book, paperwork, follow-ups. They also show on the main task list.</p>
        </div>
        <ModalForm action={addTask} title={`Add a task for ${person.firstName}`} triggerLabel="Add task" submitLabel="Add task">
          <input type="hidden" name="stay" value="1" />
          <TaskFields
            staff={staff.map(member => ({ id: member.id, name: `${member.firstName} ${member.lastName}` }))}
            people={people.map(option => ({ id: option.id, name: `${option.firstName} ${option.lastName}` }))}
            homes={homes.map(home => ({ id: home.id, name: home.name }))}
            categories={settings.task_categories}
            prefix="person-task"
            defaults={{ individualId: id, homeId: person.homeId ?? undefined }}
          />
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
                  <div className="no-print pt-0.5"><TaskCheck action={finishTask.bind(null, task.id)} label={`Mark ${task.title} done`} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      <Link href={`/app/tasks/${task.id}`} className="hover:text-brand">{task.title}</Link>
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
