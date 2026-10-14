/*
 * Who may manage whose login. Kept free of database code so it can be unit tested.
 * Admins manage every login. Coordinators manage DSP and nurse logins only.
 * Nobody may disable or change the role of their own login, which prevents locking the office out.
 */
export type LoginRole = "admin" | "coordinator" | "nurse" | "dsp";
export const loginRoles: LoginRole[] = ["dsp", "nurse", "coordinator", "admin"];

export const loginRoleLabel: Record<LoginRole, string> = {
  dsp: "Direct support (logs, medications, own shifts)",
  nurse: "Nurse (same as direct support)",
  coordinator: "Coordinator (manages people, staff and schedules)",
  admin: "Administrator (everything, including coordinator logins)",
};

type Actor = { id: string; role: LoginRole };

export function rolesActorMayGrant(actor: Actor): LoginRole[] {
  if (actor.role === "admin") return loginRoles;
  if (actor.role === "coordinator") return ["dsp", "nurse"];
  return [];
}

export function mayManageLogin(actor: Actor, target: { id: string; role: LoginRole }): boolean {
  if (actor.id === target.id) return false;
  return rolesActorMayGrant(actor).includes(target.role);
}

export function assertMayGrant(actor: Actor, role: string): asserts role is LoginRole {
  if (!rolesActorMayGrant(actor).includes(role as LoginRole)) {
    throw new Error("You cannot give that level of access.");
  }
}

/* The login role that best fits a staff job, used as the default when creating a login. */
export function defaultLoginRole(staffRole: string): LoginRole {
  if (staffRole === "admin") return "admin";
  if (staffRole === "coordinator" || staffRole === "residential_manager") return "coordinator";
  if (staffRole === "nurse") return "nurse";
  return "dsp";
}

export function passwordProblem(password: string, confirm: string, minLength: number): string | null {
  if (password.length < minLength) return `Use at least ${minLength} characters.`;
  if (password.length > 200) return "That password is too long.";
  if (password !== confirm) return "The two passwords do not match.";
  if (/^(.)\1+$/.test(password)) return "Choose a password that is not one repeated character.";
  return null;
}
