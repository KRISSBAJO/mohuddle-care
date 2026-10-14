/* Facts about Mohuddle, the product, that its own website shows. Change them here, once. */
export const product = {
  name: "Mohuddle",
  tagline: "Care operations for disability services agencies",
  description:
    "Mohuddle runs a disability services agency in one place: daily notes written by voice, medications, time clock and EVV, incidents, note review, plans and payroll.",
  signInHref: "/login",
};

export type Feature = { title: string; text: string; points: string[]; icon: "notes" | "pill" | "clock" | "alert" | "check" | "user" | "file" | "calendar" | "bell" };

/* What an agency runs on Mohuddle. Only list what is built. */
export const features: Feature[] = [
  { title: "Daily notes", text: "Full shift notes in the shape reviewers expect, with plan goals counted against the plan.", points: ["Speak your note", "Goal counts: 2 of 3 this week", "Hourly timeline with meds"], icon: "notes" },
  { title: "Medications", text: "A MAR that knows what is due, late, given, refused or held, for every person and home.", points: ["Late dose alerts", "Changes keep their history", "Doses shown in notes"], icon: "pill" },
  { title: "Time clock and EVV", text: "Clock in at the home with location, read the handover, and hand over before you leave.", points: ["Geofenced punches", "Timesheets to payroll", "EVV visit export"], icon: "clock" },
  { title: "Incidents", text: "The Reportable Event Form, started from the person, with their details already filled in.", points: ["Tier 1 deadline timers", "Notification log", "Investigations tracked"], icon: "alert" },
  { title: "Note review", text: "Supervisors approve notes, send them back with what to fix, or edit with a reason.", points: ["Bulk approval", "Flags for late or off-clock notes", "Every edit recorded"], icon: "check" },
  { title: "People and plans", text: "Everything about a person in one place: plan goals, health, weight, care team and documents.", points: ["ISP goals and steps", "Weight chart and BMI", "Care team contacts"], icon: "user" },
  { title: "Documents and signing", text: "Policies, forms and credentials with expiry dates, signed electronically.", points: ["Expiry reminders", "E-signatures", "Staff and people files"], icon: "file" },
  { title: "Schedule and shifts", text: "Shift patterns for each home, open shifts, cover for time off, and who is on now.", points: ["Shift patterns", "Time off with balances", "Live on-shift board"], icon: "calendar" },
  { title: "Notifications", text: "The right people are told: late doses, missed notes, no-shows, incidents and weight changes.", points: ["Chosen by role", "Home managers included", "No duplicates"], icon: "bell" },
];

/* The working day, start to finish. */
export const day = [
  { when: "Before the shift", title: "Clock in at the home", text: "Staff clock in on their phone at the home, read the last handover, and see who they support today." },
  { when: "During the shift", title: "Care, recorded as it happens", text: "Doses on the MAR, incidents started from the person, and the note spoken in two minutes." },
  { when: "End of shift", title: "Nothing left behind", text: "Clock-out checks the handover, the notes and the doses. What is missing is shown before they leave." },
  { when: "In the office", title: "Review, approve, pay", text: "Supervisors approve notes in bulk, timesheets lock into payroll, and EVV visits export in one file." },
];

/* Who uses it and what changes for them. */
export const roles = [
  { who: "Direct support staff", what: "Talk through the shift instead of typing for half an hour. Check, sign, go home." },
  { who: "Home managers", what: "See who is on, what is late and what needs a look, for your home only." },
  { who: "Coordinators and admins", what: "Review queues, deadlines and settings for the whole agency in one place." },
  { who: "Nurses", what: "Medication exceptions, health notes, weights and appointments, without chasing paper." },
];

/* Plain answers. Keep claims to what the product does. */
export const questions = [
  { q: "Where does the voice go?", a: "To your own server. Speech is turned into words and the note is drafted there; the recording is never saved and nothing is sent to another company." },
  { q: "Does the AI sign notes?", a: "No. It only fills empty boxes. Staff read every highlighted part, change what is wrong, and sign it themselves. Supervisors can still review it." },
  { q: "Can we set our own rules?", a: "Yes. Deadlines, required checks, who is told about what, clock-in allowances, note sections and review flags are settings, not code." },
  { q: "Is it only for Tennessee?", a: "It started with Tennessee DIDD providers, so it speaks their forms. The rules are settings, so other states' agencies can set their own." },
];
