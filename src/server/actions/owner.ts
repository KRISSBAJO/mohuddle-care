"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TIME_ZONES } from "@/lib/agency-defaults";
import { requireUser } from "@/server/guard";
import { requireOwner } from "@/server/owner-auth";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/server/auth";
import { addressesOn, issueHandoff, ownerConsoleUrl } from "@/server/host";
import { addAgencyAdmin, createAgency, endSupport, slugProblem, slugTaken, markProductEnquiry, newAdminLink, openSupport, recordOwnerEvent, setAgencyActive, updateAgencyProfile, type AdminResult } from "@/server/owner";
import type { LinkState } from "./accounts";
import type { FormState } from "./auth";
import { BILLING_STATUSES, PLAN_FEATURES, PLAN_UNITS, type BillingStatus, type PlanFeature, type PlanUnit } from "@/lib/billing";
import { linkExpiry, money as formatMoney, parseMoney } from "@/lib/format";
import { agencyBilling, recordPayment, saveBillingRules, saveDefaultPlan, savePlan, setAgencyBilling } from "@/server/billing";
import { saveHandoverLibrary } from "@/server/handover-library";

const uuid = z.uuid();
const text = (max: number) => z.string().trim().max(max).default("");

const profile = z.object({
  name: z.string().trim().min(2, "Give the agency a name.").max(80),
  legalName: z.string().trim().min(2, "Add the agency's legal name, as it appears on documents.").max(160),
  phone: text(40),
  email: z.union([z.literal(""), z.email("Check the office email address.").max(200)]).default(""),
  address: text(200),
  cityStateZip: text(120),
  timezone: z.enum(TIME_ZONES.map(zone => zone.value) as [string, ...string[]], "Choose a time zone."),
});

const admin = z.object({
  adminName: z.string().trim().min(2, "Add the administrator's name.").max(120),
  adminEmail: z.email("Check the administrator's email address.").max(200),
});

const expiresText = linkExpiry;

const asLinkState = (result: AdminResult): LinkState =>
  result.error ? { error: result.error } : result.link ? { link: result.link, expires: expiresText(result.expiresAt!), emailed: result.emailed } : { note: result.note };

/* Creates an agency with the defaults and its first administrator, and returns their setup link. */
export type CreateAgencyState = LinkState & { agencyId?: string; trialEndsOn?: string | null };

/* Whether a web address name can be used: well formed, not kept for Mohuddle, and not taken. */
export async function checkSlugAction(slug: string): Promise<{ ok: boolean; message: string }> {
  await requireOwner();
  const name = slug.trim().toLowerCase();
  const problem = slugProblem(name);
  if (problem) return { ok: false, message: problem };
  if (await slugTaken(name)) return { ok: false, message: "Another agency already uses that address." };
  return { ok: true, message: "Available" };
}

export async function createAgencyAction(_previous: CreateAgencyState, formData: FormData): Promise<CreateAgencyState> {
  const owner = await requireOwner();
  const values = Object.fromEntries(formData.entries());
  const parsedProfile = profile.safeParse(values);
  if (!parsedProfile.success) return { error: parsedProfile.error.issues[0]?.message };
  const parsedAdmin = admin.safeParse(values);
  if (!parsedAdmin.success) return { error: parsedAdmin.error.issues[0]?.message };
  const slug = String(values.slug ?? "").trim().toLowerCase();
  const result = await createAgency(slug, parsedProfile.data, { name: parsedAdmin.data.adminName, email: parsedAdmin.data.adminEmail });
  if ("error" in result) return { error: result.error };
  await recordOwnerEvent(owner, "agency:create", result.agencyId, `${parsedProfile.data.name} at ${slug}, first administrator ${parsedAdmin.data.adminEmail}`);
  // No refresh here: it would replace the form, and the link, before it is copied. "Done" refreshes.
  const state = asLinkState(result.admin);
  const billing = await agencyBilling(result.agencyId);
  const made = { agencyId: result.agencyId, trialEndsOn: billing.billing.trialEndsOn };
  return state.error ? { ...made, note: `The agency is set up, but its administrator was not added: ${state.error} Add one from the agency's page.` } : { ...state, ...made };
}

export async function addAdminAction(agencyId: string, _previous: LinkState, formData: FormData): Promise<LinkState> {
  const owner = await requireOwner();
  if (!uuid.safeParse(agencyId).success) return { error: "Unknown agency." };
  const parsed = admin.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const result = await addAgencyAdmin(agencyId, { name: parsed.data.adminName, email: parsed.data.adminEmail });
  if (!result.error) await recordOwnerEvent(owner, "admin:add", agencyId, `${parsed.data.adminName} (${parsed.data.adminEmail})`);
  return asLinkState(result);
}

/* A fresh setup or password link for one of an agency's administrators. */
export async function newAdminLinkAction(agencyId: string, userId: string): Promise<LinkState> {
  const owner = await requireOwner();
  if (!uuid.safeParse(agencyId).success || !uuid.safeParse(userId).success) return { error: "Unknown administrator." };
  const result = await newAdminLink(agencyId, userId);
  if (!result.error) await recordOwnerEvent(owner, "admin:link", agencyId, `for administrator ${userId.slice(0, 8)}`);
  return asLinkState(result);
}

export async function updateAgencyAction(agencyId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!uuid.safeParse(agencyId).success) return { error: "Unknown agency." };
  const parsed = profile.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const changed = await updateAgencyProfile(agencyId, parsed.data);
  if (changed.length) await recordOwnerEvent(owner, "agency:update", agencyId, `Changed ${changed.join(", ")}`);
  revalidatePath("/owner", "layout");
  return {};
}

export async function setAgencyActiveAction(agencyId: string, active: boolean): Promise<FormState> {
  const owner = await requireOwner();
  if (!uuid.safeParse(agencyId).success) return { error: "Unknown agency." };
  await setAgencyActive(agencyId, active);
  await recordOwnerEvent(owner, active ? "agency:on" : "agency:off", agencyId);
  revalidatePath("/owner", "layout");
  return {};
}

export async function markEnquiryAction(id: string, handled: boolean): Promise<FormState> {
  const owner = await requireOwner();
  if (!uuid.safeParse(id).success) return { error: "Unknown request." };
  await markProductEnquiry(id, handled);
  await recordOwnerEvent(owner, handled ? "demo:handled" : "demo:waiting", null, `Request ${id.slice(0, 8)}`);
  revalidatePath("/owner/enquiries");
  return {};
}

export type SupportState = { error?: string; url?: string };

/*
 * Opens an agency for a support visit, with a reason the agency is told. With agency addresses the
 * visit opens at the agency's address and the owner stays signed in at their own; without, this
 * session becomes the visit.
 */
export async function openSupportAction(agencyId: string, _previous: SupportState, formData: FormData): Promise<SupportState> {
  const owner = await requireOwner();
  if (!uuid.safeParse(agencyId).success) return { error: "Unknown agency." };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (reason.length < 5) return { error: "Say why you are opening this agency. Its administrators are told." };
  const opened = await openSupport(owner, agencyId, reason);
  if ("error" in opened) return { error: opened.error };
  await recordOwnerEvent(owner, "support:open", agencyId, reason);
  if (addressesOn()) return { url: await issueHandoff(opened.place) };
  await destroySession();
  await createSession({ id: opened.place.userId, agencyId: opened.place.agencyId });
  redirect("/app");
}

/* Ends a support visit and goes back to the owner console. */
export async function endSupportAction() {
  const user = await requireUser();
  if (!user.supportUntil) redirect("/app");
  await endSupport(user);
  await recordOwnerEvent({ loginId: user.loginId, name: user.name.replace(/^Mohuddle support \((.*)\)$/, "$1"), email: user.email }, "support:close", user.agencyId);
  await destroySession();
  // Back to the owner console, where the owner is still signed in.
  redirect(`${ownerConsoleUrl()}`);
}

/* ---------- Plans and billing ---------- */

const money = (value: FormDataEntryValue | null) => parseMoney(String(value ?? "").trim() || "0");
const dayOrNull = (value: FormDataEntryValue | null) => {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

/* Creates or changes a plan. */
export async function savePlanAction(planId: string | null, _previous: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (planId && !uuid.safeParse(planId).success) return { error: "Unknown plan." };
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (name.length < 2) return { error: "Give the plan a name." };
  const baseCents = money(formData.get("base"));
  const unitCents = money(formData.get("perUnit"));
  if (baseCents === null || unitCents === null) return { error: "Enter prices in dollars, such as 49 or 8.50." };
  const unit = String(formData.get("unit") ?? "person") as PlanUnit;
  if (!(unit in PLAN_UNITS)) return { error: "Choose what the per-unit price counts." };
  const features = formData.getAll("features").map(String).filter((key): key is PlanFeature => PLAN_FEATURES.some(feature => feature.key === key));
  const sortOrder = Math.max(0, Math.min(99, Number(formData.get("sortOrder") ?? 0) || 0));
  await savePlan(planId, { name, description: String(formData.get("description") ?? "").trim().slice(0, 300), baseCents, unitCents, unit, features, active: formData.get("active") === "on", sortOrder });
  await recordOwnerEvent(owner, "plan:save", null, `${planId ? "Changed" : "Added"} ${name}: ${features.join(", ") || "no extra features"}`);
  revalidatePath("/owner", "layout");
  return {};
}

/* The trial length, grace period, warning days and the plan new agencies start on. */
export async function saveBillingRulesAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const days = (key: string) => Math.round(Number(formData.get(key)));
  const rules = { trialDays: days("trialDays"), graceDays: days("graceDays"), warnDays: days("warnDays") };
  if (Object.values(rules).some(value => !Number.isFinite(value) || value < 0 || value > 365)) return { error: "Use whole days from 0 to 365." };
  await saveBillingRules(rules);
  const defaultPlan = String(formData.get("defaultPlan") ?? "");
  if (uuid.safeParse(defaultPlan).success) await saveDefaultPlan(defaultPlan);
  await recordOwnerEvent(owner, "billing:rules", null, `Trial ${rules.trialDays} days, grace ${rules.graceDays} days, warning ${rules.warnDays} days`);
  revalidatePath("/owner", "layout");
  return {};
}

/* The shift-change items Mohuddle offers every agency to choose from. */
export async function saveHandoverLibraryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const items = [
    ...new Set(
      String(formData.get("handover_library") ?? "")
        .split("\n")
        .map(item => item.trim())
        .filter(Boolean),
    ),
  ];
  if (!items.length) return { error: "Keep at least one item in the library." };
  if (items.length > 80 || items.some(item => item.length > 200)) return { error: "Keep the library under 80 items of 200 characters each." };
  await saveHandoverLibrary(items);
  await recordOwnerEvent(owner, "library:handover", null, `${items.length} shift-change items`);
  revalidatePath("/owner/library");
  return {};
}

/* An agency's plan, status and dates, set by hand. */
export async function setAgencyBillingAction(agencyId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!uuid.safeParse(agencyId).success) return { error: "Unknown agency." };
  const status = String(formData.get("status") ?? "") as BillingStatus;
  if (!(status in BILLING_STATUSES)) return { error: "Choose a status." };
  const planId = String(formData.get("planId") ?? "");
  const input = { planId: uuid.safeParse(planId).success ? planId : null, status, trialEndsOn: dayOrNull(formData.get("trialEndsOn")), paidUntil: dayOrNull(formData.get("paidUntil")), notes: String(formData.get("notes") ?? "").trim().slice(0, 1000) };
  if (status === "trial" && !input.trialEndsOn) return { error: "A trial needs the day it ends." };
  await setAgencyBilling(agencyId, input);
  await recordOwnerEvent(owner, "billing:update", agencyId, `${BILLING_STATUSES[status]}${input.trialEndsOn && status === "trial" ? `, trial to ${input.trialEndsOn}` : ""}${input.paidUntil ? `, paid until ${input.paidUntil}` : ""}`);
  revalidatePath("/owner", "layout");
  return {};
}

/* A payment received, and the day it pays up to. */
export async function recordPaymentAction(agencyId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!uuid.safeParse(agencyId).success) return { error: "Unknown agency." };
  const amountCents = money(formData.get("amount"));
  if (!amountCents) return { error: "Enter the amount received." };
  const paidOn = dayOrNull(formData.get("paidOn"));
  const coversUntil = dayOrNull(formData.get("coversUntil"));
  if (!paidOn || !coversUntil) return { error: "Enter the day it was paid and the day it pays up to." };
  if (coversUntil < paidOn) return { error: "It cannot pay up to a day before it was paid." };
  const method = String(formData.get("method") ?? "invoice").slice(0, 40);
  await recordPayment(agencyId, { amountCents, paidOn, coversUntil, method, note: String(formData.get("note") ?? "").trim().slice(0, 300) }, `${owner.name} (${owner.email})`);
  await recordOwnerEvent(owner, "billing:payment", agencyId, `${formatMoney(amountCents)} by ${method}, pays up to ${coversUntil}`);
  revalidatePath("/owner", "layout");
  return {};
}
