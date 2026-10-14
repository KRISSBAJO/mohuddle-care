import { eq } from "drizzle-orm";
import { csvCell, EXPORT_COLUMNS, hours, type ExportColumn } from "@/lib/payroll";
import { canManage, getSessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { isDay, periodOverview } from "@/server/queries/payroll";
import { getSettings } from "@/server/settings";

/*
 * The payroll file for one pay period: one row per staff member, in the columns chosen in Settings.
 * A period that is not locked yet is marked DRAFT in the file name, so it is not paid by mistake.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !canManage(user)) return new Response("Only coordinators and administrators can export payroll.", { status: 403 });
  const start = new URL(request.url).searchParams.get("period");
  if (!isDay(start)) return new Response("Choose a pay period.", { status: 400 });
  const [period] = await db.select().from(schema.payPeriods).where(eq(schema.payPeriods.startDate, start)).limit(1);
  if (!period) return new Response("Unknown pay period.", { status: 404 });
  const settings = await getSettings();
  const overview = await periodOverview({ start: period.startDate, end: period.endDate }, settings);
  const columns = settings.payroll_export_columns as ExportColumn[];

  const value = (row: (typeof overview.rows)[number], column: ExportColumn): string => {
    switch (column) {
      case "employee_number": return row.employeeNumber;
      case "first_name": return row.first;
      case "last_name": return row.last;
      case "email": return row.email;
      case "period_start": return period.startDate;
      case "period_end": return period.endDate;
      case "regular_hours": return hours(row.totals.regular);
      case "overtime_hours": return hours(row.totals.overtime);
      case "total_hours": return hours(row.totals.total);
      case "holiday_hours": return hours(row.totals.holiday);
      case "adjustment_hours": return hours(row.totals.adjustments);
      case "status": return row.sheet?.status ?? "open";
    }
  };

  const lines = [columns.map(column => csvCell(EXPORT_COLUMNS[column])).join(","), ...overview.rows.map(row => columns.map(column => csvCell(value(row, column))).join(","))];
  const locked = period.status === "locked";
  if (locked) await db.update(schema.payPeriods).set({ exportedAt: new Date() }).where(eq(schema.payPeriods.id, period.id));
  await db.insert(schema.auditLog).values({ userId: user.id, action: locked ? "payroll:export" : "payroll:export_draft", entity: "pay_period", entityId: period.id });
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll-${period.startDate}-to-${period.endDate}${locked ? "" : "-DRAFT"}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
