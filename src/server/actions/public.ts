"use server";

import { z } from "zod";
import { db, schema } from "@/server/db";

const enquirySchema = z.object({
  kind: z.enum(["contact", "referral", "careers", "foster"]).default("contact"),
  name: z.string().trim().min(2, "Please tell us your name.").max(120),
  email: z.email("Please enter a valid email address.").max(200),
  phone: z.string().trim().max(40).default(""),
  interest: z.string().trim().max(120).default(""),
  message: z.string().trim().max(3000).default(""),
  // A hidden field people never fill in. Bots do.
  website: z.string().max(0).default(""),
});

export type EnquiryState = { ok: boolean; error?: string };

export async function submitEnquiry(_previous: EnquiryState, formData: FormData): Promise<EnquiryState> {
  const parsed = enquirySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const values = { ...parsed.data };
  Reflect.deleteProperty(values, "website");
  try {
    await db.insert(schema.enquiries).values(values);
  } catch {
    return { ok: false, error: "We could not save your message. Please try again or call our team." };
  }
  return { ok: true };
}
