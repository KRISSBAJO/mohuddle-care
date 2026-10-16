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

