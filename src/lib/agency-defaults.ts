import type { schema } from "@/server/db";

/*
 * What a new agency starts with: document types, shift patterns and the daily-note sections. Signing
 * templates come from default-sign-templates.ts and settings from their fallbacks in settings.ts.
 * Administrators change all of these afterwards; nothing here is fixed for an agency.
 */

type DocumentType = Omit<typeof schema.documentTypes.$inferInsert, "agencyId">;

export const DEFAULT_DOCUMENT_TYPES: DocumentType[] = [
  { name: "Signed job application", category: "staff", description: "The completed and signed application form.", required: true, expires: false, reminderDays: 30, sortOrder: 1 },
  { name: "Form I-9, employment eligibility", category: "staff", description: "Completed I-9 with copies of the documents seen.", required: true, expires: false, reminderDays: 30, sortOrder: 2 },
  { name: "Form W-4", category: "staff", description: "Federal tax withholding.", required: true, expires: false, reminderDays: 30, sortOrder: 3 },
  { name: "Direct deposit authorization", category: "staff", description: "Bank details for pay, with a voided check or bank letter.", required: true, expires: false, reminderDays: 30, sortOrder: 4 },
  { name: "Government photo ID or driver's license", category: "staff", description: "Front and back.", required: true, expires: true, reminderDays: 45, credentialType: "Driver Licence", sortOrder: 5 },
  { name: "Social Security card", category: "staff", required: true, expires: false, reminderDays: 30, sortOrder: 6 },
  { name: "Criminal background check", category: "staff", description: "Fingerprint background check result.", required: true, expires: true, validityMonths: 60, reminderDays: 60, credentialType: "Background Check", sortOrder: 7 },
  { name: "Abuse registry and exclusion list checks", category: "staff", description: "Tennessee abuse registry, sex offender registry and OIG exclusion list results.", required: true, expires: true, validityMonths: 12, reminderDays: 30, sortOrder: 8 },
  { name: "TB test result", category: "staff", description: "Skin test or chest X-ray result.", required: true, expires: true, validityMonths: 12, reminderDays: 30, sortOrder: 9 },
  { name: "CPR and First Aid certificate", category: "staff", required: true, expires: true, validityMonths: 24, reminderDays: 45, credentialType: "CPR and First Aid", sortOrder: 10 },
  { name: "DIDD Core Training certificate", category: "staff", required: true, expires: false, reminderDays: 30, credentialType: "DIDD Core Training", sortOrder: 11 },
  { name: "Medication Administration certificate", category: "staff", description: "Required for staff who give medication.", required: true, roles: ["dsp", "residential_manager"], expires: true, validityMonths: 12, reminderDays: 45, credentialType: "Medication Administration", sortOrder: 12 },
  { name: "Nursing license", category: "staff", description: "Current Tennessee RN or LPN license.", required: true, roles: ["nurse"], expires: true, validityMonths: 24, reminderDays: 60, sortOrder: 13 },
  { name: "Signed employee handbook acknowledgment", category: "staff", required: true, expires: false, reminderDays: 30, sortOrder: 14 },
  { name: "HIPAA and confidentiality agreement", category: "staff", required: true, expires: false, reminderDays: 30, sortOrder: 15 },
  { name: "Signed job description", category: "staff", required: true, expires: false, reminderDays: 30, sortOrder: 16 },
  { name: "Emergency contact form", category: "staff", required: true, expires: false, reminderDays: 30, sortOrder: 17 },
  { name: "Auto insurance card", category: "staff", description: "For staff who drive people in their own car.", required: false, expires: true, validityMonths: 6, reminderDays: 30, sortOrder: 18 },
  { name: "Annual performance review", category: "staff", required: false, expires: true, validityMonths: 12, reminderDays: 30, sortOrder: 19 },
  { name: "Individual Support Plan (ISP)", category: "person", description: "The current signed ISP.", required: true, expires: true, validityMonths: 12, reminderDays: 60, sortOrder: 1 },
  { name: "Insurance card", category: "person", description: "Front and back of each card.", required: true, expires: false, reminderDays: 30, sortOrder: 2 },
  { name: "Annual physical", category: "person", description: "Report from the yearly physical exam.", required: true, expires: true, validityMonths: 12, reminderDays: 45, sortOrder: 3 },
  { name: "Emergency medical face sheet", category: "person", description: "One page for hospitals: diagnoses, medications, allergies, contacts.", required: true, expires: true, validityMonths: 12, reminderDays: 30, sortOrder: 4 },
  { name: "Consent for services and photo release", category: "person", required: true, expires: true, validityMonths: 12, reminderDays: 30, sortOrder: 5 },
  { name: "Behavior support plan", category: "person", required: false, expires: true, validityMonths: 12, reminderDays: 45, sortOrder: 6 },
  { name: "Physician's orders", category: "person", required: false, expires: true, validityMonths: 12, reminderDays: 30, sortOrder: 7 },
  { name: "Nutrition or dietary plan", category: "person", description: "From the dietitian, including texture and fluid guidance.", required: false, expires: true, validityMonths: 12, reminderDays: 30, sortOrder: 8 },
  { name: "Guardianship or conservatorship papers", category: "person", required: false, expires: false, reminderDays: 30, sortOrder: 9 },
  { name: "Medicaid or TennCare eligibility letter", category: "person", required: false, expires: true, validityMonths: 12, reminderDays: 45, sortOrder: 10 },
  { name: "State ID", category: "person", required: false, expires: true, reminderDays: 45, sortOrder: 11 },
  { name: "Business license", category: "business", required: true, expires: true, validityMonths: 12, reminderDays: 60, sortOrder: 1 },
  { name: "DIDD provider license or agreement", category: "business", required: true, expires: true, validityMonths: 12, reminderDays: 90, sortOrder: 2 },
  { name: "General liability insurance", category: "business", description: "Certificate of insurance.", required: true, expires: true, validityMonths: 12, reminderDays: 60, sortOrder: 3 },
  { name: "Workers' compensation insurance", category: "business", required: true, expires: true, validityMonths: 12, reminderDays: 60, sortOrder: 4 },
  { name: "Commercial auto insurance", category: "business", required: false, expires: true, validityMonths: 12, reminderDays: 60, sortOrder: 5 },
  { name: "Policies and procedures manual", category: "business", description: "The current approved manual.", required: true, expires: false, reminderDays: 30, sortOrder: 6 },
  { name: "Fire inspection", category: "business", description: "Fire marshal inspection report for the home.", required: true, perHome: true, expires: true, validityMonths: 12, reminderDays: 60, sortOrder: 7 },
  { name: "Emergency preparedness plan", category: "business", description: "Evacuation and emergency plan for the home.", required: true, perHome: true, expires: true, validityMonths: 12, reminderDays: 45, sortOrder: 8 },
  { name: "Licensing inspection", category: "business", description: "Most recent licensing survey for the home.", required: false, perHome: true, expires: true, validityMonths: 12, reminderDays: 60, sortOrder: 9 },
  { name: "Vehicle registration", category: "business", description: "For each agency vehicle.", required: false, expires: true, validityMonths: 12, reminderDays: 30, sortOrder: 10 },
];

/* Weekdays run three 8-hour shifts; weekends two 12-hour shifts. */
export const DEFAULT_SHIFT_PATTERNS = [
  { name: "Weekday day", start: "07:00", end: "15:00", weekdays: [1, 2, 3, 4, 5], sortOrder: 1 },
  { name: "Weekday evening", start: "15:00", end: "23:00", weekdays: [1, 2, 3, 4, 5], sortOrder: 2 },
  { name: "Weekday overnight", start: "23:00", end: "07:00", weekdays: [1, 2, 3, 4, 5], sortOrder: 3 },
  { name: "Weekend day", start: "07:00", end: "19:00", weekdays: [6, 7], sortOrder: 4 },
  { name: "Weekend night", start: "19:00", end: "07:00", weekdays: [6, 7], sortOrder: 5 },
];

/* Daily-note sections switched on for everyone. The service question library starts switched off. */
export const DEFAULT_NOTE_SECTIONS = ["care", "meals", "sleep", "activities", "behaviour", "contacts"] as const;

/* Time zones an agency can choose. Stored now; times are shown in Central until per-agency time zones are built. */
export const TIME_ZONES = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Phoenix", label: "Mountain, no daylight saving (Arizona)" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
];
