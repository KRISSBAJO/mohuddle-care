import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, Home, ListChecks, MessageSquare, Search, UserRound, UserX } from "lucide-react";
import { AutoSubmitForm } from "@/components/app/AutoSubmitForm";
import { Select } from "@/components/app/Select";
import { ModalForm } from "@/components/app/ModalForm";
import { Avatar, PageHeader } from "@/components/app/ui";
import { TaskCheck } from "@/components/tasks/TaskCheck";
import { TaskFields } from "@/components/tasks/TaskParts";
import { cn } from "@/lib/cn";
import { dateKey, fmt, initials, label } from "@/lib/format";
import { BUCKETS, dueBucket, relativeDue, type DueBucket } from "@/lib/tasks";
import { addTask, finishTask } from "@/server/actions/tasks";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { listHomes, listIndividuals, listStaff } from "@/server/queries/hub";
import { searchTasks, taskCounts, taskViews, type TaskFilters, type TaskView } from "@/server/queries/tasks";
import { getSettings } from "@/server/settings";
import { SearchSelect } from "@/components/app/SearchSelect";

export const metadata = { title: "Tasks" };

type Search = Partial<Record<keyof TaskFilters | "group", string>>;
const priorityDot = { high: "bg-flag", normal: "bg-brand", low: "bg-line" } as const;
const isId = (value?: string) => (value && /^[0-9a-f-]{36}$/.test(value) ? value : "");

/*
 * Every follow-up the team must not forget. Views for what is mine, overdue or unclaimed; filters by
 * person, home, priority and category; grouped by when it is due, who has it, or which home.
 */
export default async function TasksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const query = await searchParams;
  const defaultView: TaskView = user.staffId ? "mine" : "open";
  const filters: TaskFilters = {
    view: query.view && query.view in taskViews ? (query.view as TaskView) : defaultView,
    q: (query.q ?? "").slice(0, 80),
    home: isId(query.home),
    person: isId(query.person),
    priority: ["low", "normal", "high"].includes(query.priority ?? "") ? query.priority! : "",
    category: (query.category ?? "").slice(0, 80),
    assignee: isId(query.assignee),
  };
  const group = query.group === "assignee" || query.group === "home" ? query.group : "due";
  const [rows, counts, staff, people, homes, settings, now] = await Promise.all([
    searchTasks(filters, user.staffId),
    taskCounts(user.staffId),
    listStaff(),
    listIndividuals(),
    listHomes(),
    getSettings(),
    requestTime(),
  ]);
  const options = {
    staff: staff.map(member => ({ id: member.id, name: `${member.firstName} ${member.lastName}` })),
    people: people.map(person => ({ id: person.id, name: `${person.firstName} ${person.lastName}` })),
    homes: homes.map(home => ({ id: home.id, name: home.name })),
  };
  const href = (changes: Partial<Search>) => {
    const next = { ...query, ...changes };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value && !(key === "view" && value === defaultView) && !(key === "group" && value === "due")) params.set(key, value);
    const text = params.toString();
    return text ? `/app/tasks?${text}` : "/app/tasks";
  };
  const done = filters.view === "done";
  const groups = new Map<string, { title: string; tone?: string; rows: typeof rows }>();
  const order: DueBucket[] = ["overdue", "today", "tomorrow", "week", "later", "none"];
  for (const row of rows) {
    let key: string;
    let title: string;
    if (done) {
      key = dateKey(row.task.completedAt ?? row.task.createdAt);
      title = key === dateKey(new Date(now)) ? "Finished today" : `Finished ${fmt.weekday(key)} ${fmt.day(key)}`;
    } else if (group === "assignee") {
      key = row.task.assignedTo ?? "none";
      title = row.assignee ?? "Nobody yet";
    } else if (group === "home") {
      key = row.task.homeId ?? "none";
      title = row.home ?? "No home";
    } else {
      key = dueBucket(row.task.dueAt, now, dateKey);
      title = BUCKETS[key as DueBucket];
    }
    if (!groups.has(key)) groups.set(key, { title, tone: key === "overdue" ? "text-flag" : undefined, rows: [] });
    groups.get(key)!.rows.push(row);
  }
  const sections = [...groups.entries()].sort(([a], [b]) => (group === "due" && !done ? order.indexOf(a as DueBucket) - order.indexOf(b as DueBucket) : 0));
  const filtered = Boolean(filters.q || filters.home || filters.person || filters.priority || filters.category || filters.assignee);

  const tiles = [
    { label: "Mine, open", value: counts.mine, icon: UserRound, view: "mine", tone: "brand" },
    { label: "Overdue", value: counts.overdue, icon: AlertTriangle, view: "overdue", tone: counts.overdue ? "bad" : "good" },
    { label: "Nobody assigned", value: counts.unassigned, icon: UserX, view: "unassigned", tone: counts.unassigned ? "warn" : "good" },
    { label: "Done this week", value: counts.doneWeek, icon: CheckCircle2, view: "done", tone: "good" },
  ] as const;

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="Tasks"
        title="Tasks"
        description="Appointments to book, paperwork, repairs, purchases and follow-ups. Assign each one, set when it is due, and talk it through on the task."
        action={
          <ModalForm action={addTask} title="Add a task" triggerLabel="Add task" submitLabel="Add task">
            <input type="hidden" name="stay" value="1" />
            <TaskFields {...options} categories={settings.task_categories} prefix="new-task" defaults={{ assignedTo: user.staffId ?? undefined }} />
          </ModalForm>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(tile => (
          <Link key={tile.label} href={href({ view: tile.view })} className={cn("card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]", filters.view === tile.view && "ring-2 ring-brand/40")}>
            <span className={cn("grid h-9 w-9 place-items-center rounded-xl", tile.tone === "bad" ? "bg-flag-soft text-flag" : tile.tone === "warn" ? "bg-accent-soft text-[#8a5a10]" : tile.tone === "good" ? "bg-sage-soft text-sage" : "bg-sky text-brand-deep")}>
              <tile.icon className="h-4 w-4" />
            </span>
            <span>
              <span className="block font-display text-xl font-bold">{tile.value}</span>
              <span className="block text-xs text-mute">{tile.label}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <nav className="flex max-w-full gap-1 self-start overflow-x-auto rounded-xl bg-panel p-1" aria-label="Task views">
          {(Object.entries(taskViews) as [TaskView, string][]).map(([value, text]) => {
            const count = value === "mine" ? counts.mine : value === "open" ? counts.open : value === "overdue" ? counts.overdue : value === "unassigned" ? counts.unassigned : null;
            return (
              <Link key={value} href={href({ view: value })} aria-current={filters.view === value ? "page" : undefined} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold", filters.view === value ? "bg-white text-ink shadow-sm" : "text-mute hover:text-ink")}>
                {text}
                {count ? <span className={cn("chip px-1.5 py-0", value === "overdue" ? "bg-flag-soft text-flag" : "bg-white/80 text-mute")}>{count}</span> : null}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-1 text-xs">
          <span className="mr-1 text-mute">Group by</span>
          {[["due", "Due date", CalendarClock], ["assignee", "Person doing it", UserRound], ["home", "Home", Home]].map(([value, text, Icon]) => (
            <Link key={value as string} href={href({ group: value as string })} className={cn("chip", group === value ? "bg-ink text-white" : "bg-panel text-mute hover:text-ink")}>
              <Icon className="h-3 w-3" /> {text as string}
            </Link>
          ))}
        </div>
      </div>

      <AutoSubmitForm className="card mb-5 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(5,minmax(0,1fr))]">
        {filters.view !== defaultView && <input type="hidden" name="view" value={filters.view} />}
        {group !== "due" && <input type="hidden" name="group" value={group} />}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
          <input name="q" defaultValue={filters.q} placeholder="Search tasks" className="field py-2 pl-9" aria-label="Search tasks" />
        </div>
        <SearchSelect name="person" defaultValue={filters.person} emptyLabel="Any person" submitOnChange placeholder="Person" options={options.people.map(person => ({ value: person.id, label: person.name }))} />
        <Select name="home" defaultValue={filters.home} size="sm" aria-label="Home" emptyLabel="Any home" searchable options={options.homes.map(home => ({ value: home.id, label: home.name }))} />
        <SearchSelect name="assignee" defaultValue={filters.assignee} emptyLabel="Anyone" submitOnChange placeholder="Assigned to" options={options.staff.map(member => ({ value: member.id, label: member.name }))} />
        <Select name="priority" defaultValue={filters.priority} size="sm" aria-label="Priority" emptyLabel="Any priority" options={Object.entries({ high: "High", normal: "Normal", low: "Low" }).map(([value, text]) => ({ value, label: text }))} />
        <Select name="category" defaultValue={filters.category} size="sm" aria-label="Category" emptyLabel="Any category" options={settings.task_categories.map(category => ({ value: category, label: category }))} />
      </AutoSubmitForm>
      {filtered && (
        <p className="-mt-3 mb-4 text-xs text-mute">
          {rows.length} {rows.length === 1 ? "task matches" : "tasks match"} · <Link href={href({ q: "", person: "", home: "", assignee: "", priority: "", category: "" })} className="font-semibold text-brand">Clear filters</Link>
        </p>
      )}

      {rows.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <ListChecks className="h-10 w-10 text-sage" />
          <p className="mt-3 font-display text-lg font-bold">{filtered ? "No tasks match" : filters.view === "mine" ? "Nothing on your list" : filters.view === "overdue" ? "Nothing overdue" : "No tasks here"}</p>
          <p className="mt-1 text-sm text-mute">{filters.view === "mine" ? "Tasks assigned to you appear here." : "Add a task to get started."}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {sections.map(([key, section]) => (
            <section key={key}>
              <h2 className={cn("mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-mute", section.tone)}>
                {section.title} <span className="chip bg-panel px-1.5 py-0 text-mute">{section.rows.length}</span>
              </h2>
              <ul className="card divide-y divide-line/60 overflow-hidden">
                {section.rows.map(row => {
                  const task = row.task;
                  const overdue = task.status === "open" && task.dueAt && task.dueAt.getTime() < now;
                  return (
                    <li key={task.id} className={cn("flex items-start gap-3 px-4 py-3", overdue && "bg-flag-soft/25")}>
                      <div className="pt-0.5">
                        <TaskCheck action={finishTask.bind(null, task.id)} label={`Mark ${task.title} done`} done={task.status === "done"} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", priorityDot[task.priority])} title={`${label("taskPriority", task.priority)} priority`} />
                          <Link href={`/app/tasks/${task.id}`} className={cn("font-semibold hover:text-brand", task.status === "done" && "text-mute line-through decoration-line")}>{task.title}</Link>
                          {task.category && <span className="chip bg-panel px-2 py-0 text-[11px] text-mute">{task.category}</span>}
                        </p>
                        <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-mute">
                          {row.person && task.individualId && <Link href={`/app/individuals/${task.individualId}?tab=tasks`} className="hover:text-brand">{row.person}</Link>}
                          {row.home && <span>{row.home}</span>}
                          {task.details && <span className="max-w-md truncate">{task.details}</span>}
                          {done && <span>Done by {row.finisher ?? "someone"}{task.completionNote ? `: ${task.completionNote}` : ""}</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                        {task.dueAt && !done && <span className={cn("font-semibold", overdue ? "text-flag" : "text-mute")}>{relativeDue(task.dueAt, now)}</span>}
                        {task.dueAt && !done && <span className="text-dim">{fmt.dateTime(task.dueAt)}</span>}
                        <span className="flex items-center gap-2">
                          {row.comments > 0 && <span className="inline-flex items-center gap-0.5 text-mute"><MessageSquare className="h-3 w-3" /> {row.comments}</span>}
                          {row.assigneeFirst ? (
                            <span className="inline-flex items-center gap-1" title={row.assignee ?? ""}><Avatar initials={initials(row.assigneeFirst, row.assigneeLast ?? "")} size="sm" /></span>
                          ) : (
                            <span className="text-[#8a5a10]">Unassigned</span>
                          )}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
