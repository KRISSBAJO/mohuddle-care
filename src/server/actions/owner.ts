"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TIME_ZONES } from "@/lib/agency-defaults";
import { requireOwner, requireUser } from "@/server/guard";
import { redirect } from "next/navigation";
import { createSession, destroySession, placesInOrder } from "@/server/auth";
import { addressesOn, issueHandoff } from "@/server/host";
import { addAgencyAdmin, createAgency, endSupport, markProductEnquiry, newAdminLink, openSupport, recordOwnerEvent, setAgencyActive, updateAgencyProfile, type AdminResult } from "@/server/owner";
import type { LinkState } from "./accounts";
import type { FormState } from "./auth";
import { linkExpiry } from "@/lib/format";

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
export async function createAgencyAction(_previous: LinkState, formData: FormData): Promise<LinkState> {
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
  return state.error ? { note: `The agency is set up, but its administrator was not added: ${state.error} Add one from the agency's page.` } : state;
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
  if (!active && owner.agencyId === agencyId) return { error: "You are signed in to this agency. Switch to another one before turning it off." };
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
  const home = (await placesInOrder(user.loginId))[0];
  if (home && addressesOn()) redirect(await issueHandoff({ userId: home.id, agencyId: home.agencyId, slug: home.slug }, false, "/owner"));
  redirect("/login");
}
