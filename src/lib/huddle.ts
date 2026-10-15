/*
 * The shift huddle's shape, and the short spoken briefing made from it. Shared by the web, the
 * mobile app and Ask Mohuddle. No database access here, so the briefing can be tested on its own.
 */

import { label } from "./format";

export type HuddlePerson = {
  id: string;
  name: string;
  fullName: string;
  allergies: string;
  diet: string;
  mobility: string;
  supportNotes: string;
  doses: { at: string; name: string; dose: string; late: boolean }[];
  appointments: { at: string; what: string; escort: string | null }[];
  incidents: { at: string; category: string; severity: string; open: boolean }[];
  handoverNote: string;
  goals: { title: string; label: string }[];
};

export type Huddle = {
  home: string;
  state: "on" | "upcoming";
  start: string | null;
  end: string | null;
  people: HuddlePerson[];
  handover: { from: string; at: string; note: string; incident: "none" | "reported" | "not_reported" } | null;
};

/* "8:30 AM" in Central time, from an ISO string. */
export function clockTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/* What stands out, in priority order, for the top of the card and the start of the spoken briefing. */
export function huddleHighlights(huddle: Huddle): string[] {
  const out: string[] = [];
  const late = huddle.people.flatMap(person => person.doses.filter(dose => dose.late).map(dose => `${person.name}'s ${dose.name}`));
  if (late.length) out.push(`Late doses: ${list(late)}.`);
  const allergies = huddle.people.filter(person => person.allergies.trim());
  if (allergies.length) out.push(`Allergies: ${allergies.map(person => `${person.name} (${person.allergies.trim()})`).join("; ")}.`);
  const visits = huddle.people.flatMap(person => person.appointments.map(visit => `${person.name}: ${visit.what} at ${clockTime(visit.at)}${visit.escort ? `, with ${visit.escort}` : ", no escort yet"}`));
  if (visits.length) out.push(`Appointments: ${visits.join("; ")}.`);
  const incidents = huddle.people.flatMap(person => person.incidents.filter(item => item.open).map(() => person.name));
  if (incidents.length) out.push(`Recent incidents to be aware of: ${list([...new Set(incidents)])}.`);
  if (huddle.handover?.incident === "not_reported") out.push("The last shift said an incident happened that is not reported yet.");
  return out;
}

/* A briefing that takes about 30 seconds to read aloud. */
export function huddleScript(huddle: Huddle): string {
  const names = huddle.people.map(person => person.name);
  const parts = [
    `Your huddle for ${huddle.home}.`,
    names.length ? `You are supporting ${list(names)}.` : "Nobody lives at this home right now.",
    ...huddleHighlights(huddle),
  ];
  const doses = huddle.people.flatMap(person => person.doses.filter(dose => !dose.late).map(dose => ({ person: person.name, ...dose })));
  if (doses.length) parts.push(`Doses coming up: ${list(doses.slice(0, 6).map(dose => `${dose.person}'s ${dose.name} at ${clockTime(dose.at)}`))}${doses.length > 6 ? `, and ${doses.length - 6} more` : ""}.`);
  const goals = huddle.people.flatMap(person => person.goals.map(goal => `${person.name}, ${goal.title.toLowerCase()}, ${goal.label.toLowerCase()}`));
  if (goals.length) parts.push(`Plan goals to work on: ${goals.slice(0, 4).join("; ")}.`);
  if (huddle.handover?.note) parts.push(`From the last handover by ${huddle.handover.from}: ${huddle.handover.note}`);
  return parts.join(" ");
}

export const incidentWord = (category: string) => label("incidentCategory", category) || category;
