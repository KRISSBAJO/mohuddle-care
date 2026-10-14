/* Example care teams and insurance for the demo data. Every name, number and ID here is invented. */
export const DEMO_CONTACTS = {
  Brianna: [
    { role: "Independent Support Coordinator (ISC)", name: "Keisha Morgan", organization: "Brightpath Support Coordination", phone: "615-555-0180", email: "kmorgan@example.com", isPrimary: true, notes: "Monthly visit, first week of the month." },
    { role: "Primary care physician", name: "Dr. Alan Owens", organization: "Nolensville Family Medicine", phone: "615-555-0122", fax: "615-555-0123", isPrimary: true },
    { role: "Nutritionist or dietitian", name: "Lauren Pike, RD", organization: "Vanderbilt Nutrition Services", phone: "615-555-0156", isPrimary: true, notes: "Chopped diet, thin liquids." },
    { role: "Physical therapist", name: "Dana Ruiz, PT", organization: "Elite Physical Therapy", phone: "615-555-0144", isPrimary: true },
    { role: "Pharmacy", name: "Walgreens #4471", organization: "Nolensville Pike", phone: "615-555-0190", isPrimary: true, notes: "Blister packs, delivered Fridays." },
  ],
  Tasha: [
    { role: "Independent Support Coordinator (ISC)", name: "Keisha Morgan", organization: "Brightpath Support Coordination", phone: "615-555-0180", isPrimary: true },
    { role: "Neurologist", name: "Dr. Ferris", organization: "Vanderbilt Neurology", phone: "615-555-0177", isPrimary: true },
  ],
} as const;

export const DEMO_INSURANCE = {
  Brianna: [
    { kind: "Medicaid / TennCare", rank: "primary" as const, payer: "BlueCare Tennessee", plan: "ECF CHOICES", memberId: "TN-DEMO-482190", phone: "800-555-0100", effectiveFrom: "2026-01-01", renewInDays: 22 },
    { kind: "Medicare", rank: "secondary" as const, payer: "Medicare", plan: "Parts A and B", memberId: "1EG4-DEMO-MK72", phone: "800-555-0110", effectiveFrom: "2019-09-01", renewInDays: null },
  ],
  Tasha: [{ kind: "Medicaid / TennCare", rank: "primary" as const, payer: "Amerigroup", plan: "TennCare Medicaid", memberId: "TN-DEMO-771045", phone: "800-555-0120", effectiveFrom: "2026-03-01", renewInDays: 140 }],
} as const;
