/* Talks to the Mohuddle server's phone API (/api/v1). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3400").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: { token?: string | null; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1${path}`, {
      method: options.body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(options.token ? { authorization: `Bearer ${options.token}` } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "offline", "No connection. Check your signal and try again.");
  }
  const data = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
  if (!response.ok) throw new ApiError(response.status, data.code ?? "failed", data.error ?? "Something went wrong. Try again.");
  return data as T;
}

/* The agency's phone app rules, set in Settings on the website. */
export type Rules = { lockMinutes: number; pinLength: "6" | "4" | "either"; biometrics: boolean; pinAttempts: number };

/* What GET /me returns. */
export type Me = {
  user: { name: string; email: string; role: string; isStaff: boolean; canManage: boolean };
  agency: { id: string; name: string; zone: string } | null;
  agencies: { agencyId: string; name: string }[];
  rules: Rules;
  features: { scribe: boolean; assistant: boolean; signing: boolean };
  readOnly: boolean;
};

/* What GET /today returns. Dates arrive as ISO strings. */
export type Today = {
  clock:
    | { state: "on"; since: string; home: string | null; shiftEndsAt: string | null; onBreak: boolean }
    | {
        state: "off";
        shift: { startsAt: string; endsAt: string; home: string; pattern: string | null } | null;
        next: { startsAt: string; home: string; pattern: string | null } | null;
      };
  home: { id: string; name: string } | null;
  people: { id: string; name: string; initials: string; dosesDue: number; doseLate: boolean }[];
  doseRounds: { at: string; doses: number; people: number; late: boolean }[];
  notes: { missing: number; overdue: number } | null;
  tasks: { id: string; title: string; dueAt: string | null; priority: string }[];
  handovers: number;
};

export type Position = { latitude: number; longitude: number; accuracy?: number };
type Point = { latitude: number | null; longitude: number | null };

/* What GET /clock returns. */
export type ClockScreen =
  | { state: "none" }
  | {
      state: "off";
      shift: { id: string; startsAt: string; endsAt: string; homeId: string; home: string; pattern: string | null } | null;
      next: { startsAt: string; home: string } | null;
      homes: ({ id: string; name: string } & Point)[];
      handovers: {
        id: string;
        homeId: string;
        note: string;
        people: { individualId: string; name: string; note: string }[];
        checks: { label: string; done: boolean; comment: string }[];
        incident: "none" | "reported" | "not_reported";
        createdAt: string;
        staff: string | null;
      }[];
      rules: { requirements: ("location" | "handover" | "statements")[]; statements: string[]; geofence: number; earlyMinutes: number };
    }
  | {
      state: "on";
      entry: { clockInAt: string; home: string | null; hasHome: boolean; shiftEndsAt: string | null; onBreak: "meal" | "rest" | null };
      homePoint: Point;
      people: { id: string; name: string; noteWritten: boolean; dosesDue: { medication: string; scheduledFor: string }[] }[];
      notesMissing: number;
      dosesMissing: number;
      checklist: string[];
      overstay: number;
      leftEarly: number;
      worked: number;
      fullName: string;
      rules: { blocking: ("handover" | "checks" | "incident" | "notes" | "doses")[]; minChars: number; location: boolean; geofence: number };
    };

/* What GET /notes returns: recent shifts and who still needs a note. */
export type NotesOwed = {
  shifts: { shiftId: string; home: string; pattern: string; startsAt: string; endsAt: string; state: "in_progress" | "due" | "overdue"; dueBy: string; people: { id: string; name: string; logId: string | null }[] }[];
};

export type NoteItem = { id: string; label: string; fieldType: "yes_no" | "number" | "choice" | "multi" | "text"; options: string[]; unit: string; help: string; required: boolean; followUpOn: "Yes" | "No" | ""; followUpPrompt: string; followUpDocs: string[] };
export type SectionKey = "care" | "meals" | "sleep" | "continence" | "vitals" | "seizure" | "activities" | "behaviour" | "contacts" | "timeline";

/* What GET /notes/form returns: what one person's shift note asks. */
export type NoteForm = {
  person: { id: string; name: string; first: string; allergies: string; supportNotes: string };
  shift: { id: string; kind: string; name: string; home: string; startsAt: string; endsAt: string } | null;
  defaults: { logDate: string; shift: string; timeIn: string; timeOut: string };
  sections: { key: SectionKey; title: string; hint: string; on: boolean; required: boolean }[];
  items: NoteItem[];
  goals: { id: string; title: string; description: string; measurableStep: string; setupNotes: string; progress: string }[];
  timeline: { hour: string; meds: string[] }[];
  lists: {
    requiredChecks: string[];
    locations: string[];
    adlItems: string[];
    promptLevels: string[];
    adlExtra: string[];
    activityTypes: string[];
    moods: string[];
    meals: string[];
    intake: string[];
    sleepQuality: string[];
    stoolTypes: string[];
    goalOffered: Record<string, string>;
    goalOutcome: Record<string, string>;
  };
  summaryMin: number;
  scribe: boolean;
};

export type DoseStatus = "given" | "refused" | "missed" | "held";

/* What GET /meds returns: today's medicine round at a home. */
export type MedRound = {
  home: { id: string; name: string } | null;
  homes: { id: string; name: string }[];
  people: { id: string; name: string; allergies: string }[];
  doses: {
    id: string;
    individualId: string;
    scheduledFor: string;
    status: "due" | DoseStatus;
    recordedAt: string | null;
    note: string;
    medication: string;
    dose: string;
    route: string;
    instructions: string;
    controlled: boolean;
    by: string | null;
  }[];
  /* As-needed medicines at the home, with their limits and the last day's doses. */
  prn: {
    id: string;
    individualId: string;
    name: string;
    dose: string;
    route: string;
    instructions: string;
    controlled: boolean;
    prnUse: string;
    prnMinHours: number | null;
    prnMaxPerDay: number | null;
    givenToday: number;
    nextAllowedAt: string | null;
    recent: { id: string; at: string; reason: string; effect: string; effectAt: string | null; staffId: string | null; by: string | null }[];
  }[];
  lateMinutes: number;
  effectMinutes: number;
};

export type DoseResult = { adminId: string; ok: true } | { adminId: string; ok: false; code: string; error: string };


/* What GET /people/{id} returns: a person's key facts. */
export type PersonFacts = {
  id: string;
  name: string;
  preferredName: string;
  age: number | null;
  pronouns: string;
  home: string | null;
  language: string;
  communication: string;
  mobility: string;
  diet: string;
  likes: string;
  allergies: string;
  diagnoses: string;
  supportNotes: string;
  contacts: { role: string; name: string; phone: string }[];
  medications: { id: string; name: string; dose: string; route: string; instructions: string; controlled: boolean; when: string }[];
  goals: { id: string; title: string; measurableStep: string }[];
  appointments: { id: string; type: string; scheduledAt: string; clinic: string }[];
};

export type TaskSummary = { id: string; title: string; details: string; dueAt: string | null; priority: "low" | "normal" | "high"; status: "open" | "done"; completedAt: string | null; person: string | null; home: string | null };

export type TaskDetail = Omit<TaskSummary, "person"> & {
  completionNote: string;
  category: string;
  person: string | null;
  personLast: string | null;
  comments: { id: string; body: string; createdAt: string; by: string | null }[];
};
