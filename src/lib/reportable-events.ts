/*
 * The Tennessee DIDD Reportable Event Form, as a catalogue: event types grouped by tier, the
 * interventions, and the extra involvement questions. Keys are stable; labels can be reworded.
 * Agency-specific lists (who is notified, waiver types, health plans, locations) are in Settings.
 */

export type EventGroup = { key: "tier1" | "tier2" | "behavioral" | "medical" | "other"; title: string; deadline: string; events: { key: string; label: string; detail?: string }[] };

export const EVENT_GROUPS: EventGroup[] = [
  {
    key: "tier1",
    title: "Tier 1 events",
    deadline: "Report to DIDD Investigations as soon as possible, within 4 hours, and file with DIDD Event Management within one business day.",
    events: [
      { key: "t1_emotional_abuse", label: "Alleged emotional or psychological abuse", detail: "When medical intervention or treatment is necessary" },
      { key: "t1_exploitation", label: "Alleged exploitation of a person supported", detail: "When medical treatment or an intervention is necessary" },
      { key: "t1_financial", label: "Alleged financial exploitation exceeding $1,000" },
      { key: "t1_neglect", label: "Alleged neglect", detail: "When medical treatment or an intervention is necessary and the person is not at continued risk of serious harm" },
      { key: "t1_physical_abuse", label: "Alleged physical abuse", detail: "When medical intervention or treatment is necessary. Remove the employee or volunteer named from direct support until DIDD completes its investigation." },
      { key: "t1_sexual_abuse", label: "Alleged sexual abuse", detail: "Remove the employee or volunteer named from direct support until DIDD completes its investigation." },
      { key: "t1_death_unexpected", label: "Death, unexpected or unexplained" },
      { key: "t1_injury_unknown", label: "Serious injury of unknown cause" },
      { key: "t1_suspicious_injury", label: "Suspicious injury", detail: "Abuse or neglect is suspected and medical treatment or an intervention is necessary" },
    ],
  },
  {
    key: "tier2",
    title: "Tier 2 events",
    deadline: "File with DIDD Event Management as soon as possible, within one business day.",
    events: [
      { key: "t2_emotional_abuse", label: "Alleged emotional or psychological abuse", detail: "No medical treatment or intervention, no crisis intervention, and no continued risk of serious harm" },
      { key: "t2_exploitation", label: "Alleged exploitation of a person supported" },
      { key: "t2_financial", label: "Alleged financial exploitation", detail: "Valued between $250 and $1,000" },
      { key: "t2_neglect", label: "Alleged neglect", detail: "No medical intervention or treatment necessary and no continued risk of serious harm" },
      { key: "t2_physical_abuse", label: "Alleged physical abuse", detail: "No medical intervention or treatment and no continued risk of serious harm. Decide with the person or their representative whether to remove the employee named from direct support until the investigation ends." },
      { key: "t2_suspicious_injury", label: "Suspicious injury", detail: "Abuse or neglect is suspected but no medical treatment or intervention is necessary" },
    ],
  },
  {
    key: "behavioral",
    title: "Reportable behavioral or psychiatric events",
    deadline: "File with DIDD Event Management within one business day.",
    events: [
      { key: "b_crisis_intervention", label: "Behavioral crisis requiring crisis intervention" },
      { key: "b_crisis_psychotropic", label: "Behavioral crisis requiring emergency psychotropic medication" },
      { key: "b_crisis_restraint", label: "Behavioral crisis requiring protective equipment, manual or mechanical restraint", detail: "Regardless of type, time used or approval by plan of care. All takedowns and prone restraints are prohibited." },
      { key: "b_criminal", label: "Criminal conduct or probable criminal conduct" },
      { key: "b_law_enforcement", label: "Engagement with law enforcement" },
      { key: "b_physical_aggression", label: "Physical aggression" },
      { key: "b_property", label: "Property destruction exceeding $100" },
      { key: "b_psych_admission", label: "Psychiatric admission (for observation), including in an acute care hospital" },
      { key: "b_injury_to_other", label: "Reportable behavior injuring another person", detail: "Physical aggression or self-injury that injured a housemate, staff member or member of the public" },
      { key: "b_self_injury", label: "Self-injurious behavior", detail: "Resulting in an injury that needs more than basic first aid by a lay person" },
      { key: "b_sexual_aggression", label: "Sexual aggression" },
      { key: "b_suicide_attempt", label: "Suicide attempt" },
    ],
  },
  {
    key: "medical",
    title: "Reportable medical events",
    deadline: "File with DIDD Event Management within one business day.",
    events: [
      { key: "m_cellulitis", label: "Cellulitis" },
      { key: "m_choking", label: "Choking episode requiring medical intervention", detail: "Abdominal thrust, back blows or Heimlich" },
      { key: "m_death_expected", label: "Death (other than unexpected or unexplained)" },
      { key: "m_fecal_impaction", label: "Fecal impaction" },
      { key: "m_flu", label: "Flu" },
      { key: "m_bite", label: "Insect or animal bite requiring medical treatment by a medical professional" },
      { key: "m_mrsa", label: "MRSA" },
      { key: "m_pneumonia", label: "Pneumonia" },
      { key: "m_pressure_ulcer", label: "Pressure ulcer or decubitus ulcer" },
      { key: "m_status_epilepticus", label: "Seizure progressing to status epilepticus" },
      { key: "m_sepsis", label: "Sepsis" },
      { key: "m_injury_known", label: "Serious injury of known cause" },
      { key: "m_allergic", label: "Severe allergic reaction requiring medical treatment by a medical professional" },
      { key: "m_dehydration", label: "Severe dehydration requiring medical treatment by a medical professional" },
      { key: "m_skin_infection", label: "Skin infection (other than cellulitis and MRSA)" },
      { key: "m_uti", label: "Urinary tract infection (UTI)" },
      { key: "m_other", label: "Other medical diagnosis", detail: "A diagnosis only, not symptoms" },
    ],
  },
  {
    key: "other",
    title: "Other reportable events",
    deadline: "File with DIDD Event Management within one business day.",
    events: [
      { key: "o_psychotropic_no_consent", label: "Routine psychotropic medication given without consent" },
      { key: "o_emergency", label: "Emergency situation", detail: "Fire, flooding or serious property damage that harms or risks harm to people supported" },
      { key: "o_remote_backup", label: "Enabling technology remote supports: failure to follow the emergency back-up plan" },
      { key: "o_fall_injury", label: "Fall with injury" },
      { key: "o_med_variance", label: "Medication variance or omission" },
      { key: "o_missing", label: "Missing person (more than 1 hour)" },
      { key: "o_unsafe_environment", label: "Unsafe environment" },
      { key: "o_vehicle_minor", label: "Minor vehicle accident while transporting a person", detail: "No injury, or one a lay person can treat" },
      { key: "o_vehicle_serious", label: "Serious vehicle accident while transporting a person", detail: "Resulting in medical intervention and treatment" },
      { key: "o_fire_victim", label: "Victim of fire" },
    ],
  },
];

export const INJURED_PARTIES = { housemate: "Housemate", citizen: "Private citizen or other", staff: "Staff" } as const;

export const INTERVENTION_GROUPS: { title: string; items: { key: string; label: string }[] }[] = [
  { title: "Admission or discharge", items: [{ key: "i_incarceration_admit", label: "Incarceration admission" }, { key: "i_incarceration_discharge", label: "Incarceration discharge" }] },
  {
    title: "Crisis services",
    items: [
      { key: "i_911", label: "911 call" },
      { key: "i_ems", label: "EMT (ambulance)" },
      { key: "i_er", label: "Emergency room visit" },
      { key: "i_fire_dept", label: "Fire department" },
      { key: "i_mobile_crisis", label: "Mobile crisis services" },
      { key: "i_police", label: "Police" },
      { key: "i_urgent_care", label: "Urgent care facility" },
    ],
  },
  {
    title: "Additional interventions",
    items: [
      { key: "i_heimlich", label: "Abdominal thrust, back blows or Heimlich maneuver" },
      { key: "i_prn_psychotropic", label: "Administration of PRN psychotropic medication" },
      { key: "i_aed_cpr", label: "Automated external defibrillator (AED) or CPR" },
      { key: "i_manual_restraint", label: "Manual restraint" },
      { key: "i_mechanical_restraint", label: "Mechanical restraint" },
      { key: "i_protective_equipment", label: "Protective equipment" },
      { key: "i_xray", label: "X-ray (to rule out fracture)" },
    ],
  },
];

export const INVOLVEMENT_QUESTIONS = [
  { key: "legal_rep", label: "Does the person supported have a legal representative?" },
  { key: "harold_jordan", label: "Is the person currently receiving care at the Harold Jordan Center?" },
  { key: "private_icf", label: "Is the person currently a private payor at a State ICF?" },
] as const;

export const REGIONS = { east: "East (ETRO)", middle: "Middle (MTRO)", west: "West (WTRO)" } as const;

const groupOf = new Map(EVENT_GROUPS.flatMap(group => group.events.map(event => [event.key, group.key] as const)));
const labelOf = new Map(EVENT_GROUPS.flatMap(group => group.events.map(event => [event.key, event.label] as const)));
const interventionLabel = new Map(INTERVENTION_GROUPS.flatMap(group => group.items.map(item => [item.key, item.label] as const)));

export const eventLabel = (key: string) => labelOf.get(key) ?? key;
export const interventionName = (key: string) => interventionLabel.get(key) ?? key;
export const isEventKey = (key: string) => groupOf.has(key);
export const isInterventionKey = (key: string) => interventionLabel.has(key);

/* The most urgent tier among the event types ticked: tier 1, tier 2, other reportable, or none. */
export function eventTier(keys: string[]): "tier1" | "tier2" | "reportable" | "" {
  const groups = keys.map(key => groupOf.get(key)).filter(Boolean);
  if (groups.includes("tier1")) return "tier1";
  if (groups.includes("tier2")) return "tier2";
  return groups.length ? "reportable" : "";
}

/* A sensible internal category from the event types, so lists and reports still group well. */
export function categoryFor(keys: string[]): "injury" | "medication_error" | "behavioural" | "allegation" | "elopement" | "property" | "other" {
  if (keys.some(key => /abuse|neglect|exploitation|financial|suspicious/.test(key))) return "allegation";
  if (keys.some(key => key.startsWith("b_property"))) return "property";
  if (keys.some(key => key.startsWith("b_"))) return "behavioural";
  if (keys.includes("o_med_variance") || keys.includes("o_psychotropic_no_consent")) return "medication_error";
  if (keys.includes("o_missing")) return "elopement";
  if (keys.some(key => /injury|fall|bite|vehicle|choking/.test(key))) return "injury";
  return "other";
}

/* How soon it must reach the state, in hours from when it happened or was discovered. */
export function deadlinesFor(tier: ReturnType<typeof eventTier>, settings: { tier1Hours: number; fileHours: number }) {
  if (tier === "tier1") return { investigationsHours: settings.tier1Hours, fileHours: settings.fileHours };
  if (tier) return { investigationsHours: null, fileHours: settings.fileHours };
  return { investigationsHours: null, fileHours: null };
}
