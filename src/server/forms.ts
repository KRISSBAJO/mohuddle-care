import { z } from "zod";
import * as schema from "./db/schema";
import type { FormState } from "./actions/auth";

/* Form schemas shared by more than one server-action file. "use server" files may only export functions. */

export const optional = (max = 2000) => z.string().trim().max(max).default("");
export const uuid = z.uuid();
export const optionalUuid = z.union([z.literal(""), z.uuid()]).transform(value => value || null);
export const optionalDate = z.union([z.literal(""), z.iso.date()]).transform(value => value || null);

/* "monthlyBudget" -> "Monthly budget", for error messages people read. */
const fieldName = (key: string) => {
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/*
 * The first problem in a form, in plain words. Messages written as full sentences are shown as they
 * are; built-in ones get the field's name in front so people know which box to fix.
 */
export function firstError(error: z.ZodError): FormState {
  const issue = error.issues[0];
  if (!issue) return { error: "Please check the form." };
  if (/[.?!]$/.test(issue.message)) return { error: issue.message };
  const field = issue.path[0];
  return { error: field ? `${fieldName(String(field))}: ${issue.message}` : issue.message };
}

export const medicationFields = z.object({
  name: z.string().trim().min(2, "Medication name is required.").max(120),
  dose: z.string().trim().min(1, "Dose is required.").max(80),
  route: z.string().trim().min(1).max(40).default("oral"),
  times: z
    .string()
    .transform(value =>
      value
        .split(/[,\s]+/)
        .map(part => part.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM, for example 08:00"))
        .min(1, "Add at least one time.")
        .max(12)
        .transform(times => [...new Set(times)].sort()),
    ),
  prescriber: optional(120),
  instructions: optional(1000),
});

export const medicationSchema = medicationFields.extend({ individualId: uuid });

export const homeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(schema.homeType.enumValues),
  address: optional(200),
  city: z.string().trim().min(1).max(80).default("Nashville"),
  capacity: z.coerce.number().int().min(1).max(20),
  phone: optional(40),
  zip: z.union([z.literal(""), z.string().trim().regex(/^\d{5}(-\d{4})?$/, "Use a 5-digit ZIP code, for example 37217.")]).default(""),
  county: optional(60),
  region: z.enum(["", "east", "middle", "west"]).default(""),
  licenseNumber: optional(60),
  openedOn: optionalDate,
  notes: optional(2000),
  staffedPatterns: z.array(z.uuid()).max(50).optional(),
  openDays: z.array(z.coerce.number().int().min(1).max(7)).max(7).optional(),
});

/* Home forms send checkboxes, which arrive as repeated fields. Only forms showing them change them. */
export function homeFormValues(formData: FormData) {
  const values: Record<string, unknown> = Object.fromEntries(formData.entries());
  if (formData.get("staffingFields")) {
    values.staffedPatterns = [...new Set(formData.getAll("staffedPatterns").map(String))];
    values.openDays = [...new Set(formData.getAll("openDays").map(Number))].sort();
  } else {
    delete values.staffedPatterns;
    delete values.openDays;
  }
  return values;
}

export const staffSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  role: z.enum(schema.staffRole.enumValues),
  email: z.email().max(200).transform(value => value.toLowerCase()),
  phone: optional(40),
  homeId: optionalUuid,
  hiredAt: optionalDate,
  employeeNumber: optional(40),
  employmentType: optional(60),
  address: optional(200),
  emergencyContact: optional(120),
  emergencyPhone: optional(40),
});
