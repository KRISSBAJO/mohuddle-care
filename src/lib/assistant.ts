/*
 * Ask Mohuddle: turns what someone typed or said into one of a fixed list of requests. Plain rules
 * first, so the common requests are instant and predictable. Anything the rules cannot place is
 * "unknown"; the server may then ask the local model to choose from the same list, never more.
 * No database access here, so the rules can be tested on their own.
 */

export const PAGES = {
  today: { label: "Today", href: "/app", words: ["today", "home page", "dashboard", "start page"] },
  clock: { label: "My time clock", href: "/app/clock", words: ["time clock", "clock page", "my clock", "punches"] },
  mar: { label: "Medications (MAR)", href: "/app/medications", words: ["mar", "medications", "medication", "meds", "med pass", "doses"] },
  notes: { label: "Daily notes", href: "/app/daily-logs", words: ["daily notes", "daily logs", "notes", "logs"] },
  review: { label: "Review notes", href: "/app/daily-logs?view=review", words: ["review", "approve notes", "note review", "sent back"] },
  schedule: { label: "Schedule", href: "/app/schedule", words: ["schedule", "rota", "shifts", "calendar"] },
  timesheets: { label: "My timesheets", href: "/app/clock/timesheets", words: ["timesheet", "timesheets", "time sheet", "time sheets", "hours sheet"] },
  timeoff: { label: "My time off", href: "/app/clock/time-off", words: ["time off", "leave", "vacation", "pto", "holiday"] },
  incidents: { label: "Incidents", href: "/app/incidents", words: ["incidents", "incident reports", "reportable events"] },
  people: { label: "People we support", href: "/app/individuals", words: ["people", "individuals", "clients", "residents", "people we support"] },
  staff: { label: "Staff", href: "/app/staff", words: ["staff", "employees", "team"] },
  tasks: { label: "Tasks", href: "/app/tasks", words: ["tasks", "to do list", "todo"] },
  documents: { label: "My documents", href: "/app/my-documents", words: ["documents", "my documents", "forms", "paperwork"] },
  appointments: { label: "Appointments", href: "/app/appointments", words: ["appointments", "doctor visits", "visits"] },
  settings: { label: "Settings", href: "/app/settings", words: ["settings", "rules", "configuration"] },
} as const;
export type PageKey = keyof typeof PAGES;

export type Intent =
  | { kind: "clock_in" }
  | { kind: "clock_out" }
  | { kind: "break_start"; break: "meal" | "rest" | null }
  | { kind: "break_end" }
  | { kind: "next_shift" }
  | { kind: "whos_on" }
  | { kind: "my_hours" }
  | { kind: "whats_due" }
  | { kind: "leave" }
  | { kind: "write_note"; person: string }
  | { kind: "incident"; person: string }
  | { kind: "open"; page: PageKey }
  | { kind: "help"; query: string }
  | { kind: "greeting" }
  | { kind: "unknown"; text: string };

export const INTENT_KINDS = ["clock_in", "clock_out", "break_start", "break_end", "next_shift", "whos_on", "my_hours", "whats_due", "leave", "write_note", "incident", "open", "help", "greeting", "unknown"] as const;

/* Lower case, plain words: punctuation and filler removed, so speech and typing read the same. */
export function normalize(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(please|can you|could you|would you|hey|ok|okay|mohuddle|um|uh|just|now|for me)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

const has = (text: string, ...phrases: string[]) => phrases.some(phrase => text.includes(` ${phrase} `));

/* The name after "for", "about" or "with", as said: "write a note for Aisha Robinson" gives "Aisha Robinson". */
function nameAfter(original: string, words: string[]): string {
  const match = new RegExp(`\\b(?:${words.join("|")})\\s+(.+)$`, "i").exec(original.replace(/[.?!,]+$/g, "").trim());
  return match ? match[1].replace(/\b(today|now|please|this shift)\b/gi, "").trim() : "";
}

/* What was asked, by the rules. "unknown" when nothing fits. */
export function parseRequest(raw: string): Intent {
  const text = normalize(raw);
  if (text.trim().length === 0) return { kind: "unknown", text: raw };

  // Questions about their own day come first: they often start with "how" or "when".
  if (has(text, "next shift", "when do i work", "when am i working", "when is my shift", "my shift today", "my shift tomorrow", "do i work today", "do i work tomorrow", "am i working", "my next shift", "when do i start")) return { kind: "next_shift" };
  if (has(text, "whos on", "who is on", "whos working", "who is working", "who is on shift", "whos on shift", "on shift now", "who is here")) return { kind: "whos_on" };
  if (has(text, "how many hours", "my hours", "hours this week", "hours worked", "worked this week", "overtime")) return { kind: "my_hours" };
  if (has(text, "time off balance", "leave balance", "pto balance", "how much leave", "how much time off", "vacation balance", "sick balance", "how many hours of leave")) return { kind: "leave" };
  if (has(text, "whats due", "what is due", "what do i need to do", "what do i have to do", "what should i do", "whats left", "what is left", "my tasks", "to do", "notes owed", "notes do i owe", "what am i missing", "anything due")) return { kind: "whats_due" };

  // "How do I clock in?" is a question about the app, not a request to clock in.
  if (/^ (how|where|why|explain|help|tell me about|what is|what are|what does|whats a|what happens|is there|can i|do i need) /.test(text)) {
    return { kind: "help", query: text.trim() === "help" ? "" : raw.trim() };
  }

  // Breaks before clocking: "back from break" and "end my break" must not read as clocking out.
  if (has(text, "end my break", "end break", "end the break", "stop my break", "stop break", "finish my break", "finish break", "back from break", "back from my break", "back from lunch", "im back", "i am back", "break is over", "break over")) return { kind: "break_end" };
  if (/ (start|take|taking|go on|going on|begin|starting|on) (my |a |the )?(meal |lunch |dinner |rest |short |coffee |smoke |15 |30 |fifteen |thirty )?(minute )?break /.test(text) || has(text, "break time", "lunch break", "meal break", "rest break", "im on break", "going for lunch")) {
    const meal = has(text, "meal", "lunch", "dinner", "30", "thirty");
    const rest = has(text, "rest", "short", "coffee", "smoke", "15", "fifteen");
    return { kind: "break_start", break: meal ? "meal" : rest ? "rest" : null };
  }

  if (has(text, "clock me in", "clock in", "clocking in", "punch in", "punch me in", "start my shift", "starting my shift", "sign in for my shift", "im here for my shift", "i am here for my shift", "begin my shift")) return { kind: "clock_in" };
  if (has(text, "clock me out", "clock out", "clocking out", "punch out", "punch me out", "end my shift", "ending my shift", "finish my shift", "im leaving", "i am leaving", "going home", "im done for the day", "done for today")) return { kind: "clock_out" };

  if (/ (write|start|new|do|add|make)( a| the| my)?( daily| shift)? (note|log)( for| about) /.test(text)) {
    const person = nameAfter(raw, ["for", "about"]);
    if (person) return { kind: "write_note", person };
  }
  if (/ (report|file|log|start|write)( an| a| the)? (incident|reportable event|event report)( for| about| with)? /.test(text)) {
    return { kind: "incident", person: nameAfter(raw, ["for", "about", "with"]) };
  }

  const opener = /^ (open|go to|goto|show me|show|take me to|bring up|view|see) (the |my )?(.+) $/.exec(text);
  if (opener) {
    const target = ` ${opener[3]} `;
    const page = (Object.keys(PAGES) as PageKey[]).find(key => PAGES[key].words.some(word => target.includes(` ${word} `)));
    if (page) return { kind: "open", page };
  }

  if (/^ (hi|hello|hey there|good morning|good afternoon|good evening|thanks|thank you|cheers) $/.test(text)) return { kind: "greeting" };
  return { kind: "unknown", text: raw };
}

/* Best matching people by name: exact full name, then first or last name, then names that start with what was said. */
export function matchPeople<T extends { first: string; last: string }>(people: T[], said: string): T[] {
  const words = normalize(said).trim().split(" ").filter(Boolean);
  if (!words.length) return [];
  const full = words.join(" ");
  const score = (person: T) => {
    const first = person.first.toLowerCase();
    const last = person.last.toLowerCase();
    if (`${first} ${last}` === full) return 4;
    if (words.length > 1 && words.includes(first) && words.includes(last)) return 3;
    if (words.includes(first) || words.includes(last)) return 2;
    if (words.some(word => word.length >= 3 && (first.startsWith(word) || last.startsWith(word)))) return 1;
    return 0;
  };
  const scored = people.map(person => ({ person, score: score(person) })).filter(item => item.score > 0);
  const best = Math.max(0, ...scored.map(item => item.score));
  return scored.filter(item => item.score === best).map(item => item.person);
}

/* "7 h 20 min", "45 min". */
export function hoursWords(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/* What Ask Mohuddle answers with. Actions are offered for the person to confirm; nothing happens by itself. */
export type AssistantLink = { label: string; href: string };
export type AssistantConfirm =
  | {
      action: "clock_in";
      shiftId: string;
      title: string;
      detail: string;
      statements: string[];
      handovers: { id: string; from: string; at: string; note: string }[];
    }
  | { action: "break_start"; options: { kind: "meal" | "rest"; label: string }[] }
  | { action: "break_end"; title: string };
export type AssistantReply = { say: string; detail?: string[]; links?: AssistantLink[]; confirm?: AssistantConfirm; via: "rules" | "model" | "help" | "none" };
