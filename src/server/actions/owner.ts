"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TIME_ZONES } from "@/lib/agency-defaults";
import { requireOwner } from "@/server/guard";
import { addAgencyAdmin, createAgency, markProductEnquiry, newAdminLink, setAgencyActive, updateAgencyProfile, type AdminResult } from "@/server/owner";
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
  await requireOwner();
  const values = Object.fromEntries(formData.entries());
  const parsedProfile = profile.safeParse(values);
  if (!parsedProfile.success) return { error: parsedProfile.error.issues[0]?.message };
  const parsedAdmin = admin.safeParse(values);
  if (!parsedAdmin.success) return { error: parsedAdmin.error.issues[0]?.message };
  const slug = String(values.slug ?? "").trim().toLowerCase();
  const result = await createAgency(slug, parsedProfile.data, { name: parsedAdmin.data.adminName, email: parsedAdmin.data.adminEmail });
  if ("error" in result) return { error: result.error };
  // No refresh here: it would replace the form, and the link, before it is copied. "Done" refreshes.
  const state = asLinkState(result.admin);
  return state.error ? { note: `The agency is set up, but its administrator was not added: ${state.error} Add one from the agency's page.` } : state;
}

export async function addAdminAction(agencyId: string, _previous: LinkState, formData: FormData): Promise<LinkState> {
  await requireOwner();
  if (!uuid.safeParse(agencyId).success) return { error: "Unknown agency." };
  const parsed = admin.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  return asLinkState(await addAgencyAdmin(agencyId, { name: parsed.data.adminName, email: parsed.data.adminEmail }));
}

/* A fresh setup or password link for one of an agency's administrators. */
export async function newAdminLinkAction(agencyId: string, userId: string): Promise<LinkState> {
  await requireOwner();
  if (!uuid.safeParse(agencyId).success || !uuid.safeParse(userId).success) return { error: "Unknown administrator." };
  return asLinkState(await newAdminLink(agencyId, userId));
}

export async function updateAgencyAction(agencyId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  await requireOwner();
  if (!uuid.safeParse(agencyId).success) return { error: "Unknown agency." };
  const parsed = profile.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await updateAgencyProfile(agencyId, parsed.data);
  revalidatePath("/owner", "layout");
  return {};
}

export async function setAgencyActiveAction(agencyId: string, active: boolean): Promise<FormState> {
  const owner = await requireOwner();
  if (!uuid.safeParse(agencyId).success) return { error: "Unknown agency." };
  if (!active && owner.agencyId === agencyId) return { error: "You are signed in to this agency. Switch to another one before turning it off." };
  await setAgencyActive(agencyId, active);
  revalidatePath("/owner", "layout");
  return {};
}

export async function markEnquiryAction(id: string, handled: boolean): Promise<FormState> {
  await requireOwner();
  if (!uuid.safeParse(id).success) return { error: "Unknown request." };
  await markProductEnquiry(id, handled);
  revalidatePath("/owner/enquiries");
  return {};
}
