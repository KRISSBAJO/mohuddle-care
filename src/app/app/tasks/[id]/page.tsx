import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, CheckCircle2, Home, MessageSquare, RotateCcw, Tag, UserRound } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { ModalForm } from "@/components/app/ModalForm";
import { Avatar, Badge, Field, Panel } from "@/components/app/ui";
import { TaskFields } from "@/components/tasks/TaskParts";
import { cn } from "@/lib/cn";
import { fmt, initials, label } from "@/lib/format";
import { relativeDue } from "@/lib/tasks";
import { commentOnTask, editTask, finishTask, removeTask, reopenTask } from "@/server/actions/tasks";
import { canManage } from "@/server/auth";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { listHomes, listIndividuals, listStaff } from "@/server/queries/hub";
import { taskDetail } from "@/server/queries/tasks";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Task" };
const priorityTone = { low: "neutral", normal: "brand", high: "bad" } as const;

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, staff, people, homes, settings, now] = await Promise.all([taskDetail(id), listStaff(), listIndividuals(), listHomes(), getSettings(), requestTime()]);
  if (!detail) notFound();
  const { task } = detail;
  const open = task.status === "open";
  const overdue = open && task.dueAt && task.dueAt.getTime() < now;
  const mayEdit = canManage(user) || task.createdBy === user.id || (user.staffId !== null && task.assignedTo === user.staffId);
  const mayDelete = canManage(user) || task.createdBy === user.id;
  const options = {
    staff: staff.map(member => ({ id: member.id, name: `${member.firstName} ${member.lastName}` })),
    people: people.map(person => ({ id: person.id, name: `${person.firstName} ${person.lastName}` })),
    homes: homes.map(home => ({ id: home.id, name: home.name })),
  };

  return (
    <div className="max-w-4xl">
      <Link href="/app/tasks" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> All tasks</Link>

      <section className={cn("card mb-6 p-6", overdue && "ring-2 ring-flag/30")}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <Badge tone={open ? (overdue ? "bad" : "brand") : "good"}>{open ? (overdue ? "Overdue" : "Open") : "Done"}</Badge>
              <Badge tone={priorityTone[task.priority]}>{label("taskPriority", task.priority)} priority</Badge>
              {task.category && <Badge tone="neutral"><Tag className="h-3 w-3" /> {task.category}</Badge>}
            </p>
            <h1 className={cn("mt-2 text-2xl font-bold sm:text-3xl", !open && "text-mute line-through decoration-line")}>{task.title}</h1>
            {task.details && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{task.details}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {open ? (
              <ModalForm action={finishTask.bind(null, task.id)} title="Mark as done" triggerLabel="Mark done" triggerIcon="none" submitLabel="Mark done">
                <Field label="What was done (optional)" htmlFor="done-note"><textarea id="done-note" name="note" rows={3} maxLength={1000} className="field" placeholder="Booked for Nov 3 at 10:00 with Dr. Lin." /></Field>
              </ModalForm>
            ) : (
              <ConfirmAction action={reopenTask.bind(null, task.id)} label="Reopen" />
            )}
            {mayEdit && (
              <ModalForm action={editTask.bind(null, task.id)} title="Edit task" triggerLabel="Edit" triggerIcon="pencil" triggerTone="ghost" submitLabel="Save">
                <TaskFields task={task} {...options} categories={settings.task_categories} prefix="edit-task" />
              </ModalForm>
            )}
          </div>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex gap-2.5">
            <UserRound className="mt-0.5 h-4 w-4 text-dim" />
            <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-mute">Who does it</dt><dd className="flex items-center gap-1.5">{detail.assigneeFirst ? <><Avatar initials={initials(detail.assigneeFirst, detail.assigneeLast ?? "")} size="sm" /> {detail.assignee}</> : <span className="font-semibold text-[#8a5a10]">Nobody yet</span>}</dd></div>
          </div>
          <div className="flex gap-2.5">
            <CalendarClock className="mt-0.5 h-4 w-4 text-dim" />
            <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-mute">Due</dt><dd className={cn(overdue && "font-semibold text-flag")}>{task.dueAt ? <>{fmt.dateTime(task.dueAt)}{open && <span className="block text-xs">{relativeDue(task.dueAt, now)}</span>}</> : "No date"}</dd></div>
          </div>
          <div className="flex gap-2.5">
            <Home className="mt-0.5 h-4 w-4 text-dim" />
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-mute">About</dt>
              <dd>
                {detail.person && task.individualId ? <Link href={`/app/individuals/${task.individualId}`} className="font-semibold hover:text-brand">{detail.person}</Link> : null}
                {detail.home && <span className="block text-xs text-mute">{detail.home}</span>}
                {!detail.person && !detail.home && <span className="text-mute">General</span>}
              </dd>
            </div>
          </div>
          <div className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-dim" />
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-mute">Record</dt>
              <dd className="text-xs text-mute">
                Added {fmt.dateTime(task.createdAt)}{detail.creator ? ` by ${detail.creator}` : ""}
                {task.completedAt && <span className="block">Done {fmt.dateTime(task.completedAt)}{detail.finisher ? ` by ${detail.finisher}` : ""}</span>}
              </dd>
            </div>
          </div>
        </dl>
        {task.completionNote && <p className="mt-4 rounded-xl bg-sage-soft px-4 py-3 text-sm text-sage"><span className="font-semibold">What was done: </span>{task.completionNote}</p>}
      </section>

      <Panel title={`Conversation (${detail.thread.length})`}>
        {detail.thread.length > 0 && (
          <ol className="divide-y divide-line/60">
            {detail.thread.map(({ comment, who }) => (
              <li key={comment.id} className="flex gap-3 px-5 py-3">
                <Avatar initials={initials((who ?? "S").split(" ")[0] ?? "", (who ?? "").split(" ").at(-1) ?? "")} size="sm" tone="neutral" />
                <div className="min-w-0">
                  <p className="text-xs text-mute"><span className="font-semibold text-ink">{who ?? "Someone"}</span> · {fmt.dateTime(comment.createdAt)}</p>
                  <p className="whitespace-pre-line text-sm">{comment.body}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className="border-t border-line p-5">
          <ActionForm action={commentOnTask.bind(null, task.id)} submitLabel="Add comment">
            <label htmlFor="comment-body" className="sr-only">Comment</label>
            <textarea id="comment-body" name="body" rows={2} maxLength={2000} required className="field" placeholder="Add an update or a question. The person doing it and whoever made it are told." />
          </ActionForm>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-mute"><MessageSquare className="h-3.5 w-3.5" /> Comments stay with the task.</p>
        </div>
      </Panel>

      {mayDelete && (
        <div className="mt-6 flex justify-end">
          <ConfirmAction action={removeTask.bind(null, task.id)} label="Delete task" tone="danger" confirm="Delete this task and its conversation? This cannot be undone." />
        </div>
      )}
      {!open && <p className="mt-3 flex items-center gap-1.5 text-xs text-mute"><RotateCcw className="h-3.5 w-3.5" /> Reopen it if more needs doing.</p>}
    </div>
  );
}
