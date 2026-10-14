/*
 * Service questions an agency can switch on for every daily note. They start off; each yes or no
 * answer that needs more opens a follow-up asking for a note and listing the documents it needs.
 * The same list is in migration 0020 for databases that already exist.
 */
export const NOTE_LIBRARY: { label: string; help: string; followUpOn: "Yes" | "No"; followUpPrompt: string; followUpDocs: string[]; sortOrder: number }[] = [
  { label: "Community participation (CP) provided", help: "Did they take part in a community activity as written in their plan?", followUpOn: "Yes", followUpPrompt: "Where did you go, what did they do, and for how long?", followUpDocs: ["CP activity log"], sortOrder: 10 },
  { label: "Wrap-around support provided", help: "Support given outside the usual routine, such as an extra outing or a visit at home.", followUpOn: "Yes", followUpPrompt: "Describe the wrap-around support and who asked for it.", followUpDocs: [], sortOrder: 20 },
  { label: "All daily notes completed for this shift", help: "A note for every person you supported on this shift.", followUpOn: "No", followUpPrompt: "Which notes are missing, and why?", followUpDocs: [], sortOrder: 30 },
  { label: "Peak overlap staffing met", help: "Two or more staff on during the busy hours, as the plan requires.", followUpOn: "No", followUpPrompt: "Who was missing, and how was the gap covered?", followUpDocs: [], sortOrder: 40 },
  { label: "In the home at 11:59 pm", help: "Was the person at home at midnight?", followUpOn: "No", followUpPrompt: "Where were they, who was with them, and when did they come home?", followUpDocs: [], sortOrder: 50 },
  { label: "Behaviour data (ABC) collected", help: "Antecedent, behaviour and consequence, for behaviours in their support plan.", followUpOn: "Yes", followUpPrompt: "Summarise what happened before, during and after.", followUpDocs: ["ABC data sheet"], sortOrder: 60 },
  { label: "Weight charted", help: "Weighed and written on the weight chart, if due today.", followUpOn: "No", followUpPrompt: "Why was the weight not charted?", followUpDocs: [], sortOrder: 70 },
  { label: "Doctor or medical visit today", help: "Any appointment with a doctor, dentist, therapist or clinic.", followUpOn: "Yes", followUpPrompt: "Who did they see, and what was the outcome?", followUpDocs: ["Doctor encounter form", "Appointment documented"], sortOrder: 80 },
  { label: "Incident occurred", help: "Anything that must be reported: an injury, a fall, a medication error, a police contact.", followUpOn: "Yes", followUpPrompt: "Briefly describe what happened and what you did.", followUpDocs: ["Incident report"], sortOrder: 90 },
];

/* Where staff go to do a document named in a follow-up, when Mohuddle has a page for it. */
export function documentLink(label: string, individualId: string | null): string | null {
  const person = individualId ? `?individual=${individualId}` : "";
  if (/incident/i.test(label)) return `/app/incidents/new${person}`;
  if (/appointment|encounter|doctor/i.test(label)) return individualId ? `/app/individuals/${individualId}?tab=appointments` : "/app/appointments";
  if (/weight|vital/i.test(label)) return individualId ? `/app/individuals/${individualId}?tab=health` : null;
  return null;
}
