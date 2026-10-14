"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, dateKey, parseMoney } from "@/lib/format";
import { mayDeleteExpense, mayManageHome, mayReviewExpense, needsApproval } from "@/lib/home-policy";
import { db, schema } from "@/server/db";
import { requireManager, requireUser } from "@/server/guard";
import { getSettings } from "@/server/settings";
import type { FormState } from "./auth";

const uuid = z.uuid();
const text = (max: number) => z.string().trim().max(max).default("");

function refresh(homeId: string) {
  revalidatePath(`/app/homes/${homeId}`);
  revalidatePath("/app/homes");
  revalidatePath("/app");
}

async function loadHome(homeId: string) {
  if (!uuid.safeParse(homeId).success) return null;
  const [home] = await db.select().from(schema.homes).where(eq(schema.homes.id, homeId)).limit(1);
  return home ?? null;
}

/* ---------- Manager and budget ---------- */

export async function setHomeManagement(homeId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const home = await loadHome(homeId);
  if (!home) return { error: "Unknown home." };
  const managerRaw = String(formData.get("managerStaffId") ?? "");
  const managerStaffId = managerRaw ? managerRaw : null;
  if (managerStaffId) {
    if (!uuid.safeParse(managerStaffId).success) return { error: "Choose a staff member." };
    const [person] = await db.select({ active: schema.staff.active }).from(schema.staff).where(eq(schema.staff.id, managerStaffId)).limit(1);
    if (!person?.active) return { error: "That person is no longer on staff." };
  }
  const budgetRaw = String(formData.get("monthlyBudget") ?? "").trim();
  const monthlyBudgetCents = budgetRaw ? parseMoney(budgetRaw) : null;
  if (budgetRaw && monthlyBudgetCents === null) return { error: "Enter the budget as dollars, for example 2400 or 2400.00." };
  await db.update(schema.homes).set({ managerStaffId, monthlyBudgetCents }).where(eq(schema.homes.id, homeId));
  await db.insert(schema.auditLog).values({ userId: user.id, action: "home:management", entity: "home", entityId: homeId });
  refresh(homeId);
  return {};
}

/* ---------- Expenses ---------- */

const expenseInput = z.object({
  spentOn: z.iso.date("Choose the date it was spent."),
  category: z.string().trim().min(1, "Choose a category.").max(80),
  amount: z.string().trim().min(1, "Enter the amount."),
  vendor: text(120),
  description: z.string().trim().min(3, "Say what it was for.").max(500),
  paymentMethod: z.enum(["company_card", "petty_cash", "staff_paid", "invoice"]),
});

export async function addExpense(homeId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const home = await loadHome(homeId);
  if (!home?.active) return { error: "This home is closed." };
  const parsed = expenseInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the expense." };
  const amountCents = parseMoney(parsed.data.amount);
  if (!amountCents) return { error: "Enter the amount in dollars, for example 42.50." };
  if (parsed.data.spentOn > addDays(dateKey(), 1)) return { error: "An expense cannot be in the future." };
  const settings = await getSettings();
  if (!settings.expense_categories.includes(parsed.data.category)) return { error: "Choose one of the listed categories." };
  const waits = needsApproval(amountCents, settings.expense_approval_dollars);
  const [row] = await db
    .insert(schema.homeExpenses)
    .values({
      homeId,
      spentOn: parsed.data.spentOn,
      category: parsed.data.category,
      amountCents,
      vendor: parsed.data.vendor,
      description: parsed.data.description,
      paymentMethod: parsed.data.paymentMethod,
      submittedBy: user.id,
      status: waits ? "pending" : "approved",
    })
    .returning({ id: schema.homeExpenses.id });
  await db.insert(schema.auditLog).values({ userId: user.id, action: waits ? "expense:submit" : "expense:auto-approve", entity: "home_expense", entityId: row.id });
  refresh(homeId);
  return {};
}

export async function reviewExpense(expenseId: string, decision: "approved" | "rejected", _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(expenseId).success || !["approved", "rejected"].includes(decision)) return { error: "Unknown expense." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  if (decision === "rejected" && note.length < 3) return { error: "Say why it was rejected, so the submitter knows." };
  const [expense] = await db.select().from(schema.homeExpenses).where(eq(schema.homeExpenses.id, expenseId)).limit(1);
  if (!expense) return { error: "This expense was deleted." };
  const home = await loadHome(expense.homeId);
  if (!home || !mayReviewExpense(user, expense, home)) {
    return { error: expense.submittedBy === user.id ? "Someone else must review your own expense." : "Only a coordinator or this home's manager can review expenses." };
  }
  const updated = await db
    .update(schema.homeExpenses)
    .set({ status: decision, reviewedBy: user.id, reviewedAt: new Date(), reviewNote: note })
    .where(and(eq(schema.homeExpenses.id, expenseId), eq(schema.homeExpenses.status, "pending")))
    .returning({ id: schema.homeExpenses.id });
  if (!updated.length) return { error: "This expense was already reviewed. Refresh the page." };
  await db.insert(schema.auditLog).values({ userId: user.id, action: `expense:${decision}`, entity: "home_expense", entityId: expenseId });
  refresh(expense.homeId);
  return {};
}

export async function deleteExpense(expenseId: string): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(expenseId).success) return { error: "Unknown expense." };
  const [expense] = await db.select().from(schema.homeExpenses).where(eq(schema.homeExpenses.id, expenseId)).limit(1);
  if (!expense) return { error: "This expense was already deleted." };
  const home = await loadHome(expense.homeId);
  if (!home || !mayDeleteExpense(user, expense, home)) return { error: "You cannot remove this expense." };
  await db.delete(schema.homeExpenses).where(eq(schema.homeExpenses.id, expenseId));
  await db.insert(schema.auditLog).values({ userId: user.id, action: "expense:delete", entity: "home_expense", entityId: expenseId });
  refresh(expense.homeId);
  return {};
}

/* ---------- Issues ---------- */

const issueInput = z.object({
  title: z.string().trim().min(3, "Give the issue a short title.").max(160),
  details: text(3000),
  category: z.string().trim().min(1, "Choose a category.").max(80),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  assignedTo: z.union([z.literal(""), uuid]).transform(value => value || null),
  dueOn: z.union([z.literal(""), z.iso.date()]).transform(value => value || null),
});

export async function reportIssue(homeId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const home = await loadHome(homeId);
  if (!home?.active) return { error: "This home is closed." };
  const parsed = issueInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the issue." };
  const settings = await getSettings();
  if (!settings.issue_categories.includes(parsed.data.category)) return { error: "Choose one of the listed categories." };
  // Only people who run the home choose who fixes it; everyone else's report goes to the manager.
  const assignedTo = mayManageHome(user, home) ? parsed.data.assignedTo : home.managerStaffId;
  const [row] = await db
    .insert(schema.homeIssues)
    .values({ ...parsed.data, assignedTo, homeId, reportedBy: user.id })
    .returning({ id: schema.homeIssues.id });
  await db.insert(schema.auditLog).values({ userId: user.id, action: `issue:report:${parsed.data.priority}`, entity: "home_issue", entityId: row.id });
  refresh(homeId);
  return {};
}

const issueUpdate = z.object({
  status: z.enum(["open", "in_progress", "resolved"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  assignedTo: z.union([z.literal(""), uuid]).transform(value => value || null),
  dueOn: z.union([z.literal(""), z.iso.date()]).transform(value => value || null),
  resolution: text(2000),
});

/*
 * Anyone can move an issue along and record what was done. Changing who it is assigned to or its
 * priority is for the people who run the home. Resolving needs a note on how it was fixed.
 */
export async function updateIssue(issueId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(issueId).success) return { error: "Unknown issue." };
  const parsed = issueUpdate.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the update." };
  const [issue] = await db.select().from(schema.homeIssues).where(eq(schema.homeIssues.id, issueId)).limit(1);
  if (!issue) return { error: "This issue was deleted." };
  const home = await loadHome(issue.homeId);
  if (!home) return { error: "Unknown home." };
  const runs = mayManageHome(user, home);
  if (!runs && (parsed.data.assignedTo !== issue.assignedTo || parsed.data.priority !== issue.priority || parsed.data.dueOn !== issue.dueOn)) {
    return { error: "Only a coordinator or this home's manager can change who it is assigned to, its priority or due date." };
  }
  if (parsed.data.status === "resolved" && parsed.data.resolution.length < 3) return { error: "Say how it was fixed before marking it resolved." };
  const resolvedAt = parsed.data.status === "resolved" ? issue.resolvedAt ?? new Date() : null;
  await db
    .update(schema.homeIssues)
    .set({ ...parsed.data, resolvedAt, updatedAt: new Date() })
    .where(eq(schema.homeIssues.id, issueId));
  await db.insert(schema.auditLog).values({ userId: user.id, action: `issue:${parsed.data.status}`, entity: "home_issue", entityId: issueId });
  refresh(issue.homeId);
  return {};
}

export async function deleteIssue(issueId: string): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(issueId).success) return { error: "Unknown issue." };
  const [issue] = await db.select().from(schema.homeIssues).where(eq(schema.homeIssues.id, issueId)).limit(1);
  if (!issue) return { error: "This issue was already deleted." };
  const home = await loadHome(issue.homeId);
  if (!home || !mayManageHome(user, home)) return { error: "Only a coordinator or this home's manager can delete issues." };
  await db.delete(schema.homeIssues).where(eq(schema.homeIssues.id, issueId));
  await db.insert(schema.auditLog).values({ userId: user.id, action: "issue:delete", entity: "home_issue", entityId: issueId });
  refresh(issue.homeId);
  return {};
}
