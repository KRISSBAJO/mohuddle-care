import { Field } from "@/components/app/ui";
import { dateKey, labels } from "@/lib/format";
import type { schema } from "@/server/db";
import { SearchSelect } from "@/components/app/SearchSelect";

type Task = typeof schema.tasks.$inferSelect;
type Option = { id: string; name: string };

const clock = (at: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);

/* The task form, for adding and editing. */
export function TaskFields({
  task,
  staff,
  people,
  homes,
  categories,
  prefix,
  defaults = {},
}: {
  task?: Task;
  staff: Option[];
  people: Option[];
  homes: Option[];
  categories: string[];
  prefix: string;
  defaults?: { assignedTo?: string; individualId?: string; homeId?: string };
}) {
  const categoryOptions = task?.category && !categories.includes(task.category) ? [task.category, ...categories] : categories;
  return (
    <>
      <Field label="Task" htmlFor={`${prefix}-title`}>
        <input id={`${prefix}-title`} name="title" required minLength={3} maxLength={160} className="field" defaultValue={task?.title} placeholder="Book Brianna's annual eye exam" />
      </Field>
      <Field label="Details" htmlFor={`${prefix}-details`}>
        <textarea id={`${prefix}-details`} name="details" rows={3} maxLength={2000} className="field" defaultValue={task?.details} placeholder="What needs doing, who to call, anything already tried." />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Who does it" htmlFor={`${prefix}-assignee`}>
          <SearchSelect id={`${prefix}-assignee`} name="assignedTo" defaultValue={task?.assignedTo ?? defaults.assignedTo ?? ""} emptyLabel="Nobody yet" placeholder="Search staff" options={staff.map(member => ({ value: member.id, label: member.name }))} />
        </Field>
        <Field label="Priority" htmlFor={`${prefix}-priority`}>
          <select id={`${prefix}-priority`} name="priority" className="field" defaultValue={task?.priority ?? "normal"}>
            {Object.entries(labels.taskPriority).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </Field>
        <Field label="Category" htmlFor={`${prefix}-category`}>
          <select id={`${prefix}-category`} name="category" className="field" defaultValue={task?.category ?? ""}>
            <option value="">None</option>
            {categoryOptions.map(category => <option key={category}>{category}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Person" htmlFor={`${prefix}-person`}>
          <SearchSelect id={`${prefix}-person`} name="individualId" defaultValue={task?.individualId ?? defaults.individualId ?? ""} emptyLabel="None" placeholder="Search people" options={people.map(person => ({ value: person.id, label: person.name }))} />
        </Field>
        <Field label="Home" htmlFor={`${prefix}-home`}>
          <select id={`${prefix}-home`} name="homeId" className="field" defaultValue={task?.homeId ?? defaults.homeId ?? ""}>
            <option value="">None</option>
            {homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Due date" htmlFor={`${prefix}-date`}>
          <input id={`${prefix}-date`} name="dueDate" type="date" className="field" defaultValue={task?.dueAt ? dateKey(task.dueAt) : ""} />
        </Field>
        <Field label="Time" htmlFor={`${prefix}-time`} hint="5 PM if left blank.">
          <input id={`${prefix}-time`} name="dueTime" type="time" className="field" defaultValue={task?.dueAt ? clock(task.dueAt) : ""} />
        </Field>
      </div>
    </>
  );
}
