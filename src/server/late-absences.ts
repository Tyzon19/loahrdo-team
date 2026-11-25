// Compatibility entry points: sync and profile ownership live in attendance.ts.
import type { RowDataPacket } from "mysql2/promise";
import { AppError, parseInput } from "@/lib/errors";
import { attendanceGroupSchema } from "@/lib/validation";
import { all, run } from "./db";
import { attendanceViewer } from "./attendance-auth";
import { assertAccountReady } from "@/lib/account-readiness";
import { getMyAttendance, getAttendanceAdmin, requireAttendanceEmployee } from "./attendance";

export const listMyAttendance = getMyAttendance;
export async function listAttendanceAdmin(_input?: unknown) {
  return getAttendanceAdmin();
}
export async function syncStaffGroup(_input: unknown): Promise<never> {
  throw new AppError(
    "Run syncAllStaffGroupsNow in Apps Script. Trackers push snapshots every 15 minutes.",
  );
}
export async function saveAttendanceMapping(_input: unknown): Promise<never> {
  throw new AppError("Use the HRDO claim approval queue to assign an exact sheet row.");
}
export async function createAttendanceFlag(_input: unknown): Promise<never> {
  throw new AppError("Refresh attendance and use Acknowledge / Explain on the current incident.");
}
export async function resolveAttendanceFlag(_input: unknown): Promise<never> {
  throw new AppError("Employee explanations are available in the HRDO attendance panel.");
}

export async function listDirectorAttendance(input: unknown) {
  const current = await attendanceViewer();
  if (!current || current.accountRole !== "director" || current.role === "SUPER_ADMIN")
    throw new AppError("Only directors can view the executive attendance dashboard.");
  assertAccountReady(current);
  const { staffGroup } = parseInput(attendanceGroupSchema, input ?? {});
  const params = staffGroup ? [staffGroup] : [];
  const condition = staffGroup ? " AND p.department_group = ?" : "";
  const [logs, balances, notifications] = await Promise.all([
    all<RowDataPacket[]>(
      `SELECT i.id, i.incident_date, i.code, i.leave_type, i.credited_days,
      DAYNAME(i.incident_date) AS day_of_week, p.department_group AS staff_group,
      p.full_name AS sheet_employee_name, u.name, u.department
      FROM attendance_leave_incidents i JOIN hr_sheet_profiles p ON p.id = i.profile_id
      JOIN users u ON u.id = p.claimed_by_user_id
      WHERE p.is_active = 1 AND i.is_active = 1 AND i.incident_date BETWEEN p.cycle_start AND p.cycle_end
      ${condition} ORDER BY i.incident_date DESC LIMIT 1000`,
      params,
    ),
    all<RowDataPacket[]>(
      `SELECT p.department_group AS staff_group, COUNT(*) AS employee_count,
      SUM(p.leaves_this_year) AS leaves_this_year, SUM(p.remaining_el) AS rem_el,
      SUM(p.remaining_sl) AS rem_sl, SUM(p.remaining_vl) AS rem_vl,
      SUM((SELECT COUNT(*) FROM attendance_leave_incidents i WHERE i.profile_id = p.id
        AND i.is_active = 1 AND i.code = 'LATE' AND i.incident_date BETWEEN p.cycle_start AND p.cycle_end)) AS total_lates
      FROM hr_sheet_profiles p WHERE p.is_active = 1 AND p.claimed_by_user_id IS NOT NULL
      ${condition} GROUP BY p.department_group`,
      params,
    ),
    all<RowDataPacket[]>(
      "SELECT id, event_type, heading, body, read_at, created_at FROM attendance_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
      [current.id],
    ),
  ]);
  return { logs, balances, notifications };
}

export async function listAttendanceNotifications() {
  const current = await requireAttendanceEmployee();
  return all<RowDataPacket[]>(
    "SELECT id, event_type, heading, body, read_at, created_at FROM attendance_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
    [current.id],
  );
}
export async function markAttendanceNotificationRead(input: unknown) {
  const current = await requireAttendanceEmployee();
  const result = await run(
    "UPDATE attendance_notifications SET read_at = NOW() WHERE id = ? AND user_id = ?",
    [String(input), current.id],
  );
  if (!result.affectedRows) throw new AppError("That attendance notification was not found.");
  return { ok: true as const };
}
