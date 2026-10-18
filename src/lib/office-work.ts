import { locationVerdict } from "./timeclock";

export type OfficePolicy = {
  office_work_enabled: string; office_work_staff: string[]; office_work_address: string;
  office_work_latitude: string; office_work_longitude: string; office_work_radius: number;
};
export function officeAccessChangeError(role: string, staffId: string | null, before: string[], after: string[]) {
  if (role !== "admin") return "An administrator must configure office work access.";
  return staffId && after.includes(staffId) && !before.includes(staffId) ? "Another administrator must approve your own office-work access." : null;
}
export function officePoint(policy: OfficePolicy) {
  const latitude = Number(policy.office_work_latitude), longitude = Number(policy.office_work_longitude);
  return policy.office_work_latitude.trim() && policy.office_work_longitude.trim() && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}
export function officeAccess(policy: OfficePolicy, staffId: string, active: boolean, careShiftDue: boolean) {
  if (policy.office_work_enabled !== "on" || !officePoint(policy) || !policy.office_work_address.trim()) return "Office work has not been configured by your administrator.";
  if (!active || !policy.office_work_staff.includes(staffId)) return "Your administrator has not approved office work for your staff account.";
  if (careShiftDue) return "Your care shift is due. Clock in at its assigned home, or ask your manager to change the schedule.";
  return null;
}
export function officeLocationError(policy: OfficePolicy, position: { latitude: number; longitude: number; accuracy?: number } | null) {
  if (!position || position.accuracy == null || position.accuracy > Math.min(policy.office_work_radius, 100)) return "Share an accurate phone location at the office, then try again. Ask your manager to record the missed office time if your phone cannot locate you.";
  // Office starts require a point inside the radius; poor accuracy cannot extend it.
  if (locationVerdict(officePoint(policy), { ...position, accuracy: 0 }, policy.office_work_radius).state !== "ok") return "You must be at the configured office to start office work.";
  return null;
}
