import "server-only";
import { aliasedTable, and, asc, desc, eq, ilike, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/server/db";

export const taskViews = { mine: "My tasks", open: "All open", overdue: "Overdue", unassigned: "Unassigned", done: "Done" } as const;
export type TaskView = keyof typeof taskViews;
export type TaskFilters = { view: TaskView; q: string; home: string; person: string; priority: string; category: string; assignee: string };

const assignee = aliasedTable(schema.staff, "assignee");
const creator = aliasedTable(schema.users, "creator");
const finisher = aliasedTable(schema.users, "finisher");

function viewWhere(view: TaskView, myStaffId: string | null): SQL | undefined {
  if (view === "done") return eq(schema.tasks.status, "done");
  const open = eq(schema.tasks.status, "open");
  if (view === "mine") return and(open, myStaffId ? eq(schema.tasks.assignedTo, myStaffId) : sql`false`);
  if (view === "overdue") return and(open, lt(schema.tasks.dueAt, new Date()));
  if (view === "unassigned") return and(open, isNull(schema.tasks.assignedTo));
  return open;
}

const columns = {
  task: schema.tasks,
  assignee: sql<string | null>`${assignee.firstName} || ' ' || ${assignee.lastName}`,
  assigneeFirst: assignee.firstName,
  assigneeLast: assignee.lastName,
  home: schema.homes.name,
  person: sql<string | null>`${schema.individuals.firstName} || ' ' || ${schema.individuals.lastName}`,
  creator: creator.name,
  finisher: finisher.name,
  comments: sql<number>`(select count(*)::int from ${schema.taskComments} where ${schema.taskComments.taskId} = ${schema.tasks.id})`,
};

function base() {
  return db
    .select(columns)
    .from(schema.tasks)
    .leftJoin(assignee, eq(assignee.id, schema.tasks.assignedTo))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.tasks.homeId))
    .leftJoin(schema.individuals, eq(schema.individuals.id, schema.tasks.individualId))
    .leftJoin(creator, eq(creator.id, schema.tasks.createdBy))
    .leftJoin(finisher, eq(finisher.id, schema.tasks.completedBy));
}

/* Tasks for one view with any filters, soonest due first (or most recently finished for Done). */
export function searchTasks(filters: TaskFilters, myStaffId: string | null) {
  const term = filters.q.trim();
  return base()
    .where(
      and(
        viewWhere(filters.view, myStaffId),
        term ? or(ilike(schema.tasks.title, `%${term}%`), ilike(schema.tasks.details, `%${term}%`)) : undefined,
        filters.home ? eq(schema.tasks.homeId, filters.home) : undefined,
        filters.person ? eq(schema.tasks.individualId, filters.person) : undefined,
        filters.priority ? sql`${schema.tasks.priority} = ${filters.priority}` : undefined,
        filters.category ? eq(schema.tasks.category, filters.category) : undefined,
        filters.assignee ? eq(schema.tasks.assignedTo, filters.assignee) : undefined,
      ),
    )
    .orderBy(
      ...(filters.view === "done"
        ? [desc(schema.tasks.completedAt)]
        : [sql`${schema.tasks.dueAt} asc nulls last`, sql`case ${schema.tasks.priority} when 'high' then 0 when 'normal' then 1 else 2 end`, asc(schema.tasks.createdAt)]),
    )
    .limit(300);
}

/* How many tasks are in each view, for the tab badges. */
export async function taskCounts(myStaffId: string | null) {
  const [row] = await db
    .select({
      mine: myStaffId ? sql<number>`count(*) filter (where ${schema.tasks.status} = 'open' and ${schema.tasks.assignedTo} = ${myStaffId})`.mapWith(Number) : sql<number>`0`.mapWith(Number),
      open: sql<number>`count(*) filter (where ${schema.tasks.status} = 'open')`.mapWith(Number),
      overdue: sql<number>`count(*) filter (where ${schema.tasks.status} = 'open' and ${schema.tasks.dueAt} < now())`.mapWith(Number),
      unassigned: sql<number>`count(*) filter (where ${schema.tasks.status} = 'open' and ${schema.tasks.assignedTo} is null)`.mapWith(Number),
      doneWeek: sql<number>`count(*) filter (where ${schema.tasks.status} = 'done' and ${schema.tasks.completedAt} > now() - interval '7 days')`.mapWith(Number),
    })
    .from(schema.tasks);
  return row;
}

/* One task with its conversation. */
export async function taskDetail(id: string) {
  const [row] = await base().where(eq(schema.tasks.id, id)).limit(1);
  if (!row) return null;
  const comments = await db
    .select({ comment: schema.taskComments, who: schema.users.name })
    .from(schema.taskComments)
    .leftJoin(schema.users, eq(schema.users.id, schema.taskComments.userId))
    .where(eq(schema.taskComments.taskId, id))
    .orderBy(asc(schema.taskComments.createdAt));
  return { ...row, thread: comments };
}
