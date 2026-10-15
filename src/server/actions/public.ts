"use server";

import { z } from "zod";
import { site } from "@/lib/site";
import { agencyIdBySlug } from "@/server/agency";
import { asAgency, db, schema, systemDb } from "@/server/db";

const enquirySchema = z.object({
  kind: z.enum(["contact", "referral", "careers", "foster", "demo"]).default("contact"),
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
    if (values.kind === "demo") {
      // A Mohuddle demo request is for Mohuddle, not an agency: it goes to the owner console.
      await systemDb.insert(schema.productEnquiries).values({ name: values.name, email: values.email, phone: values.phone, agencyName: values.interest, message: values.message });
    } else {
      // Nobody is signed in on the public site; the enquiry goes to the agency the site belongs to.
      await asAgency(await agencyIdBySlug(site.agencySlug), async () => {
        await db.insert(schema.enquiries).values(values);
      });
    }
  } catch {
    return { ok: false, error: "We could not save your message. Please try again or call our team." };
  }
  return { ok: true };
}
