/*
 * Rules for home expenses and issues. No database code, so they are unit tested.
 */
type Actor = { id: string; role: string; staffId: string | null };
type Home = { managerStaffId: string | null };

const isManagerRole = (actor: Actor) => actor.role === "admin" || actor.role === "coordinator";

/* At or below the threshold an expense is approved as it is entered. A threshold of 0 means all wait. */
export const needsApproval = (amountCents: number, thresholdDollars: number) => thresholdDollars === 0 || amountCents > thresholdDollars * 100;

/* Coordinators, administrators and the home's own manager review expenses, but never their own. */
export function mayReviewExpense(actor: Actor, expense: { submittedBy: string | null }, home: Home) {
  if (expense.submittedBy === actor.id) return false;
  return isManagerRole(actor) || (actor.staffId !== null && actor.staffId === home.managerStaffId);
}

/* Who may remove an expense: its submitter while it is still waiting, or anyone who may review it. */
export function mayDeleteExpense(actor: Actor, expense: { submittedBy: string | null; status: string }, home: Home) {
  if (expense.submittedBy === actor.id && expense.status === "pending") return true;
  return mayReviewExpense(actor, expense, home) || (isManagerRole(actor) && expense.submittedBy !== actor.id);
}

/* The home manager runs the home, so they manage its issues alongside coordinators. */
export const mayManageHome = (actor: Actor, home: Home) => isManagerRole(actor) || (actor.staffId !== null && actor.staffId === home.managerStaffId);
