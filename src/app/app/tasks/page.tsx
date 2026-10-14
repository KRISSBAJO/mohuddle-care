import Link from "next/link";
import { Check } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { Badge, Empty, Field, PageHeader, Panel } from "@/components/app/ui";
import { fmt, labels } from "@/lib/format";
import { completeTask, createTask } from "@/server/actions/hub";
import { requireUser } from "@/server/guard";
import { listHomes, listIndividuals, listStaff, listTasks } from "@/server/queries/hub";
import { requestTime } from "@/server/clock";

export const metadata = { title: "Tasks" };
const priorityTone = { low: "neutral", normal: "brand", high: "bad" } as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireUser();
  const { show } = await searchParams;
  const status = show === "done" ? "done" : "open";
  const [tasks, staff, homes, people] = await Promise.all([listTasks(status), listStaff(), listHomes(), listIndividuals()]);
  const now = await requestTime();

  return (
    <>
      <PageHeader eyebrow="Tasks" title={status === "open" ? "Open tasks" : "Completed tasks"} description="Follow-ups, appointments to book, repairs, paperwork. Anything that must not be forgotten." />
      <div className="mb-4 flex gap-2">
        <Link href="/app/tasks" className={`chip ${status === "open" ? "bg-ink text-white" : "bg-panel text-mute"}`}>Open</Link>
        <Link href="/app/tasks?show=done" className={`chip ${status === "done" ? "bg-ink text-white" : "bg-panel text-mute"}`}>Done</Link>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          {tasks.length === 0 ? <Empty>Nothing here.</Empty> : (
            <ul className="divide-y divide-line/60">
              {tasks.map(task => {
                const overdue = task.status === "open" && task.dueAt && task.dueAt.getTime() < now;
                return (
                  <li key={task.id} className="flex items-start gap-3 px-5 py-3.5">
                    {task.status === "open" ? (
                      <form action={completeTask.bind(null, task.id)}><button className="mt-0.5 grid h-6 w-6 place-items-center rounded-full border-2 border-line hover:border-sage hover:bg-sage-soft" aria-label="Mark done"><Check className="h-3.5 w-3.5 text-transparent hover:text-sage" /></button></form>
                    ) : (
                      <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-sage-soft text-sage"><Check className="h-3.5 w-3.5" /></span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{task.title}</p>
                        <Badge tone={priorityTone[task.priority]}>{labels.taskPriority[task.priority]}</Badge>
                        {overdue && <Badge tone="bad">Overdue</Badge>}
                      </div>
                      {task.details && <p className="text-sm text-mute">{task.details}</p>}
                      <p className="mt-0.5 text-xs text-dim">
                        {[task.assignee ?? "Unassigned", task.person, task.home, task.dueAt ? `due ${fmt.dateTime(task.dueAt)}` : null, task.completedAt ? `done ${fmt.dateTime(task.completedAt)}` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel title="Add a task">
          <div className="p-5">
            <ActionForm action={createTask} submitLabel="Add task">
              <Field label="Task" htmlFor="task-title"><input id="task-title" name="title" required className="field" /></Field>
              <Field label="Details" htmlFor="task-details"><textarea id="task-details" name="details" rows={2} className="field" /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Assign to" htmlFor="task-assignee">
                  <select id="task-assignee" name="assignedTo" className="field" defaultValue=""><option value="">Unassigned</option>{staff.map(person => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}</select>
                </Field>
                <Field label="Priority" htmlFor="task-priority">
                  <select id="task-priority" name="priority" className="field" defaultValue="normal">{Object.entries(labels.taskPriority).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
                </Field>
                <Field label="Person" htmlFor="task-person">
                  <select id="task-person" name="individualId" className="field" defaultValue=""><option value="">None</option>{people.map(person => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}</select>
                </Field>
                <Field label="Home" htmlFor="task-home">
                  <select id="task-home" name="homeId" className="field" defaultValue=""><option value="">None</option>{homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}</select>
                </Field>
              </div>
              <Field label="Due" htmlFor="task-due"><input id="task-due" name="dueAt" type="datetime-local" className="field" /></Field>
            </ActionForm>
          </div>
        </Panel>
      </div>
    </>
  );
}
