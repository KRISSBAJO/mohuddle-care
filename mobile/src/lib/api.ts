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
