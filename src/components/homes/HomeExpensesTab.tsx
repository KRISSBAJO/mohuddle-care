import Link from "next/link";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { ModalForm } from "@/components/app/ModalForm";
import { Badge, Empty, Field, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { dateKey, fmt, label, money, monthLabel, shiftMonth } from "@/lib/format";
import { mayDeleteExpense, mayReviewExpense } from "@/lib/home-policy";
import { deleteExpense, reviewExpense } from "@/server/actions/homes";
import type { SessionUser } from "@/server/auth";
import type { schema } from "@/server/db";
import { homeExpenseMonth } from "@/server/queries/homes";

type Home = typeof schema.homes.$inferSelect;
const statusTone = { pending: "warn", approved: "good", rejected: "bad" } as const;

export async function HomeExpensesTab({ homeId, home, month, user }: { homeId: string; home: Home; month: string; user: SessionUser }) {
  const data = await homeExpenseMonth(homeId, month);
  const budget = home.monthlyBudgetCents;
  const pct = budget ? Math.min(100, Math.round((data.spentCents / budget) * 100)) : 0;
  const over = budget !== null && data.spentCents > budget;
  const base = `/app/homes/${homeId}?tab=expenses`;
  const thisMonth = dateKey().slice(0, 7);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold">{monthLabel(month)}</h2>
        <div className="flex gap-2">
          <Link href={`${base}&month=${shiftMonth(month, -1)}`} className="btn-ghost btn-sm">Previous month</Link>
          {month !== thisMonth && <Link href={base} className="btn-ghost btn-sm">This month</Link>}
          {month < thisMonth && <Link href={`${base}&month=${shiftMonth(month, 1)}`} className="btn-ghost btn-sm">Next month</Link>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-mute">Approved spending</p>
          <p className={cn("mt-1 font-display text-xl font-bold", over && "text-flag")}>{money(data.spentCents)}</p>
          {budget !== null ? (
            <>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-panel">
                <div className={cn("h-full rounded-full", over ? "bg-flag" : pct > 85 ? "bg-accent" : "bg-sage")} style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-sm text-mute">
                {over ? `${money(data.spentCents - budget)} over the ${money(budget, true)} monthly budget.` : `${money(budget - data.spentCents)} left of the ${money(budget, true)} monthly budget.`}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-mute">No monthly budget set. A coordinator can set one under Details.</p>
          )}
          {data.byCategory.length > 0 && (
            <ul className="mt-5 space-y-2">
              {data.byCategory.map(([category, cents]) => (
                <li key={category} className="grid grid-cols-[140px_1fr_80px] items-center gap-3 text-sm">
                  <span className="truncate text-mute">{category}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-panel">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round((cents / data.spentCents) * 100)}%` }} />
                  </span>
                  <span className="text-right font-semibold">{money(cents, true)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-mute">Waiting for approval</p>
          <p className="mt-1 font-display text-xl font-bold text-[#8a5a10]">{data.pendingCount}</p>
          <p className="mt-1 text-sm text-mute">{data.pendingCount ? `${money(data.pendingCents)} not yet counted` : "Nothing waiting"}</p>
          <p className="mt-4 text-xs text-mute">Coordinators and the home manager approve. Nobody approves their own expense.</p>
        </div>
      </div>

      <Panel title={`Expenses (${data.rows.length})`}>
        {data.rows.length === 0 ? (
          <Empty>No expenses in {monthLabel(month)}. Use Add expense at the top.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Date</th><th>What</th><th>Category</th><th>Paid by</th><th className="text-right">Amount</th><th>Status</th><th className="w-[220px]"></th></tr>
            </thead>
            <tbody>
              {data.rows.map(({ expense, submitter, reviewer }) => {
                const canReview = expense.status === "pending" && mayReviewExpense(user, expense, home);
                const canDelete = mayDeleteExpense(user, expense, home);
                return (
                  <tr key={expense.id}>
                    <td className="whitespace-nowrap">{fmt.day(expense.spentOn)}</td>
                    <td>
                      <p className="font-semibold">{expense.description}</p>
                      <p className="text-xs text-mute">{[expense.vendor, submitter && `added by ${submitter}`].filter(Boolean).join(" · ")}</p>
                      {expense.reviewNote && <p className="text-xs text-mute">Note: {expense.reviewNote}</p>}
                    </td>
                    <td className="text-mute">{expense.category}</td>
                    <td className="text-xs text-mute">{label("paymentMethod", expense.paymentMethod)}</td>
                    <td className={cn("whitespace-nowrap text-right font-semibold", expense.status === "rejected" && "text-dim line-through")}>{money(expense.amountCents)}</td>
                    <td>
                      <Badge tone={statusTone[expense.status]}>{label("expenseStatus", expense.status)}</Badge>
                      {reviewer && expense.status !== "pending" && <p className="mt-1 text-[11px] text-mute">by {reviewer}</p>}
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {canReview && <ConfirmAction action={reviewExpense.bind(null, expense.id, "approved")} label="Approve" tone="brand" />}
                        {canReview && (
                          <ModalForm
                            action={reviewExpense.bind(null, expense.id, "rejected")}
                            title="Reject expense"
                            description={`${money(expense.amountCents)} · ${expense.description}`}
                            triggerLabel="Reject"
                            triggerIcon="none"
                            triggerTone="ghost"
                            submitLabel="Reject expense"
                          >
                            <Field label="Why it is rejected" htmlFor={`rj-${expense.id}`} hint="The person who added it sees this.">
                              <textarea id={`rj-${expense.id}`} name="note" rows={3} required minLength={3} maxLength={300} className="field" />
                            </Field>
                          </ModalForm>
                        )}
                        {canDelete && <ConfirmAction action={deleteExpense.bind(null, expense.id)} label="Remove" confirm={`Remove the ${money(expense.amountCents)} expense "${expense.description}"?`} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
