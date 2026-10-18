const links = [
  { label: "Homes · add and manage", path: "/app/homes" },
  { label: "Add a home", path: "/app/homes/new" },
  { label: "Staff, logins and credentials", path: "/app/staff" },
  { label: "People · add and manage", path: "/app/individuals" },
  { label: "Office location and staff approvals", path: "/app/settings#office", admin: true },
  { label: "Agency settings and business rules", path: "/app/settings" },
  { label: "Shift patterns", path: "/app/settings/shifts" },
  { label: "Document center and templates", path: "/app/documents" },
  { label: "Payroll and timesheets", path: "/app/time?tab=timesheets" },
  { label: "Attendance and exports", path: "/app/time?tab=reports" },
  { label: "Full website dashboard", path: "/app" },
] as const;
export function websiteAdminLinks(role: string) {
  return role === "admin" || role === "coordinator" ? links.filter(link => !("admin" in link) || role === "admin") : [];
}
