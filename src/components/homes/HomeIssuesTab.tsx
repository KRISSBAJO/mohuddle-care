import Link from "next/link";
import { CalendarClock, CheckCircle2, UserRound } from "lucide-react";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { ModalForm } from "@/components/app/ModalForm";
import { Badge, Empty, Field, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { dateKey, fmt, label, labels } from "@/lib/format";
import { mayManageHome } from "@/lib/home-policy";
import { deleteIssue, updateIssue } from "@/server/actions/homes";
import type { SessionUser } from "@/server/auth";
import type { schema } from "@/server/db";
import { homeIssueList } from "@/server/queries/homes";

type Home = typeof schema.homes.$inferSelect;
type Staff = typeof schema.staff.$inferSelect;

const priorityStyle = {
  urgent: { stripe: "border-l-flag", tone: "bad" },
  high: { stripe: "border-l-accent", tone: "warn" },
  normal: { stripe: "border-l-brand", tone: "brand" },
  low: { stripe: "border-l-line", tone: "neutral" },
} as const;
const statusTone = { open: "warn", in_progress: "brand", resolved: "good" } as const;

export async function HomeIssuesTab({ homeId, home, show, user, staff }: { homeId: string; home: Home; show?: string; user: SessionUser; staff: Staff[] }) {
  const filter = show === "resolved" || show === "all" ? show : "active";
  const { rows, counts } = await homeIssueList(homeId, filter);
  const runs = mayManageHome(user, home);
  const today = dateKey();
  const base = `/app/homes/${homeId}?tab=issues`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {([
            ["active", `Open and in progress (${counts.open + counts.progress})`],
            ["resolved", `Resolved (${counts.resolved})`],
            ["all", "All"],
          ] as const).map(([value, text]) => (
            <Link key={value} href={value === "active" ? base : `${base}&show=${value}`} className={cn("chip", filter === value ? "bg-ink text-white" : "bg-panel text-mute hover:text-ink")}>
              {text}
            </Link>
          ))}
        </div>
        {counts.overdue > 0 && <Badge tone="bad">{counts.overdue} past their fix-by date</Badge>}
      </div>

      {rows.length === 0 ? (
        <Panel>
          <Empty>{filter === "active" ? "No open issues. Use Report issue at the top when something needs fixing." : "Nothing here."}</Empty>
        </Panel>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {rows.map(({ issue, reporter, assignee }) => {
            const style = priorityStyle[issue.priority];
            const overdue = issue.status !== "resolved" && issue.dueOn !== null && issue.dueOn < today;
            return (
              <li key={issue.id} className={cn("card border-l-4 p-5", style.stripe, issue.status === "resolved" && "opacity-75")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{issue.title}</p>
                    <p className="mt-0.5 text-xs text-mute">
                      {issue.category} · reported {fmt.dateTime(issue.createdAt)}{reporter ? ` by ${reporter}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={style.tone}>{label("issuePriority", issue.priority)}</Badge>
                    <Badge tone={statusTone[issue.status]}>{label("issueStatus", issue.status)}</Badge>
                  </div>
                </div>
                {issue.details && <p className="mt-3 whitespace-pre-line text-sm">{issue.details}</p>}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
                  <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{assignee ?? "Not assigned"}</span>
                  {issue.dueOn && (
                    <span className={cn("inline-flex items-center gap-1", overdue && "font-semibold text-flag")}>
                      <CalendarClock className="h-3.5 w-3.5" />Fix by {fmt.day(issue.dueOn)}{overdue && " (overdue)"}
                    </span>
                  )}
                </div>
                {issue.status === "resolved" && issue.resolution && (
                  <p className="mt-3 rounded-xl bg-sage-soft px-3 py-2 text-sm text-sage">
                    <CheckCircle2 className="mr-1 inline h-4 w-4" />
                    {issue.resolution}
                    {issue.resolvedAt && <span className="text-xs"> · {fmt.dateTime(issue.resolvedAt)}</span>}
                  </p>
                )}
                {issue.status !== "resolved" && issue.resolution && <p className="mt-3 text-xs text-mute">Progress: {issue.resolution}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <ModalForm
                    action={updateIssue.bind(null, issue.id)}
                    title="Update issue"
                    description={issue.title}
                    triggerLabel={issue.status === "resolved" ? "Reopen or edit" : "Update"}
                    triggerIcon="pencil"
                    triggerTone="ghost"
                    submitLabel="Save update"
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Status" htmlFor={`st-${issue.id}`}>
                        <select id={`st-${issue.id}`} name="status" className="field" defaultValue={issue.status}>
                          {Object.entries(labels.issueStatus).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                        </select>
                      </Field>
                      {runs ? (
                        <Field label="Priority" htmlFor={`pr-${issue.id}`}>
                          <select id={`pr-${issue.id}`} name="priority" className="field" defaultValue={issue.priority}>
                            {Object.entries(labels.issuePriority).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                          </select>
                        </Field>
                      ) : (
                        <input type="hidden" name="priority" value={issue.priority} />
                      )}
                      {runs ? (
                        <>
                          <Field label="Assigned to" htmlFor={`as-${issue.id}`}>
                            <select id={`as-${issue.id}`} name="assignedTo" className="field" defaultValue={issue.assignedTo ?? ""}>
                              <option value="">Nobody yet</option>
                              {staff.map(person => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
                            </select>
                          </Field>
                          <Field label="Fix by" htmlFor={`du-${issue.id}`}><input id={`du-${issue.id}`} name="dueOn" type="date" className="field" defaultValue={issue.dueOn ?? ""} /></Field>
                        </>
                      ) : (
                        <>
                          <input type="hidden" name="assignedTo" value={issue.assignedTo ?? ""} />
                          <input type="hidden" name="dueOn" value={issue.dueOn ?? ""} />
                        </>
                      )}
                    </div>
                    <Field label="What has been done" htmlFor={`re-${issue.id}`} hint="Required to mark it resolved.">
                      <textarea id={`re-${issue.id}`} name="resolution" rows={3} maxLength={2000} className="field" defaultValue={issue.resolution} placeholder="Plumber booked for Thursday" />
                    </Field>
                  </ModalForm>
                  {runs && <ConfirmAction action={deleteIssue.bind(null, issue.id)} label="Delete" confirm={`Delete "${issue.title}"? Use Resolved instead if it was fixed.`} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
