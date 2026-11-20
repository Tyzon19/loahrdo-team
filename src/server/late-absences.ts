import { randomUUID, timingSafeEqual } from "node:crypto";
import { google } from "googleapis";
import type { RowDataPacket } from "mysql2/promise";
import { AppError, parseInput } from "@/lib/errors";
import {
  BASE_ALLOCATION,
  CYCLE_EXPIRY_DATE,
  CYCLE_LABEL,
  STAFF_GROUPS,
  type ParsedStaffMatrix,
  type StaffGroup,
  parseStaffMatrix,
  attendanceSheetNameMatchesUserName,
} from "@/lib/late-absences";
import { canManageHrdoAccounts } from "@/lib/hrdo";
import { all, run, withTransaction } from "./db";
import { viewer } from "./auth";
import { hrdoViewer } from "./hrdo/auth";
import { serverEnvOptional } from "./env";
import {
  attendanceFlagSchema,
  attendanceMappingSchema,
  attendanceSyncSchema,
  attendanceGroupSchema,
  institutionalEmailAllowed,
} from "@/lib/validation";

interface SourceRow extends RowDataPacket {
  id: string;
  staff_group: StaffGroup;
  spreadsheet_id: string;
  sheet_name: string;
  last_synced_at: string | null;
  sync_status: string;
  sync_message: string | null;
}

interface MappingRow extends RowDataPacket {
  id: string;
  user_id: string;
  staff_group: StaffGroup;
  sheet_employee_name: string;
  employee_status_note: string | null;
  name: string;
  email: string;
  role: string;
}

interface ExistingLogRow extends RowDataPacket {
  id: string;
  incident_date: string;
  code: string;
}

function isStaffGroup(value: string): value is StaffGroup {
  return STAFF_GROUPS.includes(value as StaffGroup);
}

async function requireAttendanceAdmin() {
  const mainViewer = await viewer();
  if (mainViewer && (mainViewer.role === "admin" || mainViewer.isSuperAdmin)) return mainViewer;
  const hrdoUser = await hrdoViewer();
  if (canManageHrdoAccounts(hrdoUser)) return hrdoUser;
  throw new AppError("Only HR administrators can manage Late & Absences.");
}

async function requireAttendanceViewer() {
  const current = await viewer();
  if (!current) throw new AppError("Please sign in to continue.");
  return current;
}

async function requireEmployeeAttendanceViewer() {
  const current = await requireAttendanceViewer();
  if (!institutionalEmailAllowed(current.email)) {
    throw new AppError("Only institutional accounts can access employee attendance.");
  }
  return current;
}

async function requireDirectorViewer() {
  const current = await requireAttendanceViewer();
  if (current.role !== "director" && current.role !== "admin" && !current.isSuperAdmin) {
    throw new AppError("Only directors can view the executive attendance dashboard.");
  }
  return current;
}

function sourceEnvKey(group: StaffGroup) {
  return `LATE_ABSENCES_${group}_SPREADSHEET_ID`;
}

function serviceAccount() {
  const raw = serverEnvOptional("GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new AppError("Google Sheets service-account credentials are not configured.");
  try {
    return JSON.parse(raw) as { client_email: string; private_key: string };
  } catch {
    throw new AppError("Google Sheets service-account credentials are invalid JSON.");
  }
}

async function ensureSource(group: StaffGroup): Promise<SourceRow> {
  const spreadsheetId = serverEnvOptional(sourceEnvKey(group));
  if (!spreadsheetId) {
    throw new AppError(`No spreadsheet is configured for ${group}.`);
  }
  const id = randomUUID();
  await run(
    `INSERT INTO sheet_sources
      (id, staff_group, spreadsheet_id, sheet_name, sync_status)
     VALUES (?, ?, ?, 'STAFF', 'NEVER')
     ON DUPLICATE KEY UPDATE spreadsheet_id = VALUES(spreadsheet_id)`,
    [id, group, spreadsheetId],
  );
  const rows = await all<SourceRow[]>(
    "SELECT id, staff_group, spreadsheet_id, sheet_name, last_synced_at, sync_status, sync_message FROM sheet_sources WHERE staff_group = ?",
    [group],
  );
  const source = rows[0];
  if (!source) throw new AppError("The spreadsheet source could not be initialized.");
  return source;
}

async function readStaffMatrix(source: SourceRow): Promise<ParsedStaffMatrix> {
  const credentials = serviceAccount();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: source.spreadsheet_id,
    range: `${source.sheet_name}!A1:OE`,
    majorDimension: "ROWS",
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return parseStaffMatrix((response.data.values ?? []) as string[][]);
}

async function notifyAttendanceUsers(
  userIds: string[],
  eventType: "ADDED" | "UPDATED" | "REMOVED",
  heading: string,
  body: string,
  db?: Parameters<typeof run>[2],
) {
  for (const userId of [...new Set(userIds)]) {
    await run(
      `INSERT INTO attendance_notifications
        (id, user_id, event_type, heading, body)
       VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), userId, eventType, heading, body],
      db,
    );
  }
}

async function directorIds(db?: Parameters<typeof run>[2]) {
  const rows = await all<Array<RowDataPacket & { id: string }>>(
    "SELECT id FROM users WHERE role = 'director' OR is_super_admin = 1",
    [],
    db,
  );
  return rows.map((row) => String(row.id));
}

async function applySnapshot(group: StaffGroup, matrix: ParsedStaffMatrix) {
  const mappings = await all<MappingRow[]>(
    `SELECT m.id, m.user_id, m.staff_group, m.sheet_employee_name, m.employee_status_note,
            u.name, u.email, u.role
     FROM employee_sheet_mappings m
     JOIN users u ON u.id = m.user_id
     WHERE m.staff_group = ?`,
    [group],
  );
  const mappingByName = new Map(
    mappings.map((mapping) => [mapping.sheet_employee_name.trim().toUpperCase(), mapping]),
  );
  const excludedAttendanceEmails = new Set(
    (serverEnvOptional("LATE_ABSENCES_EXCLUDED_USER_EMAILS") ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  const unmappedUsers = await all<
    Array<RowDataPacket & { id: string; name: string; email: string; role: string }>
  >("SELECT id, name, email, role FROM users");
  const usedUserIds = new Set(mappings.map((mapping) => mapping.user_id));
  const directors = await directorIds();
  let changesApplied = 0;

  await withTransaction(async (conn) => {
    for (const parsed of matrix.rows) {
      let mapping = mappingByName.get(parsed.sheetEmployeeName.trim().toUpperCase());
      if (!mapping) {
        const candidates = unmappedUsers.filter(
          (user) =>
            !usedUserIds.has(user.id) &&
            !excludedAttendanceEmails.has(String(user.email).trim().toLowerCase()) &&
            attendanceSheetNameMatchesUserName(parsed.sheetEmployeeName, user.name),
        );
        if (candidates.length === 1) {
          const candidate = candidates[0]!;
          const mappingId = randomUUID();
          await run(
            `INSERT IGNORE INTO employee_sheet_mappings
              (id, user_id, staff_group, sheet_employee_name, employee_status_note)
             VALUES (?, ?, ?, ?, NULL)`,
            [mappingId, candidate.id, group, parsed.sheetEmployeeName],
            conn,
          );
          const inserted = await all<Array<RowDataPacket & { id: string }>>(
            `SELECT id FROM employee_sheet_mappings
             WHERE user_id = ? AND staff_group = ? AND sheet_employee_name = ?
             LIMIT 1`,
            [candidate.id, group, parsed.sheetEmployeeName],
            conn,
          );
          if (inserted[0]) {
            mapping = {
              id: inserted[0].id,
              user_id: candidate.id,
              staff_group: group,
              sheet_employee_name: parsed.sheetEmployeeName,
              employee_status_note: null,
              name: candidate.name,
              email: candidate.email,
              role: candidate.role,
            };
            usedUserIds.add(candidate.id);
            mappingByName.set(parsed.sheetEmployeeName.trim().toUpperCase(), mapping);
          }
        }
      }
      if (!mapping) continue;

      const existing = await all<ExistingLogRow[]>(
        "SELECT id, incident_date, code FROM attendance_logs WHERE user_id = ? AND staff_group = ?",
        [mapping.user_id, group],
        conn,
      );
      const existingByDate = new Map(existing.map((row) => [row.incident_date, row]));
      const incomingByDate = new Map(parsed.logs.map((log) => [log.incidentDate, log]));

      for (const log of parsed.logs) {
        const previous = existingByDate.get(log.incidentDate);
        const eventType = previous ? (previous.code === log.code ? null : "UPDATED") : "ADDED";
        if (!eventType) continue;
        changesApplied += 1;
        await run(
          `INSERT INTO attendance_logs
            (id, user_id, staff_group, incident_date, day_of_week, code, leave_type, credited_days)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             day_of_week = VALUES(day_of_week), code = VALUES(code),
             leave_type = VALUES(leave_type), credited_days = VALUES(credited_days),
             synced_at = CURRENT_TIMESTAMP`,
          [
            previous?.id ?? randomUUID(),
            mapping.user_id,
            group,
            log.incidentDate,
            log.dayOfWeek,
            log.code,
            log.leaveType,
            log.creditedDays,
          ],
          conn,
        );
        await notifyAttendanceUsers(
          [mapping.user_id, ...directors],
          eventType,
          eventType === "ADDED" ? "Attendance record added" : "Attendance record updated",
          `${log.code} recorded for ${log.incidentDate} (${mapping.name}).`,
          conn,
        );
      }

      for (const previous of existing) {
        if (incomingByDate.has(previous.incident_date)) continue;
        changesApplied += 1;
        await run("DELETE FROM attendance_logs WHERE id = ?", [previous.id], conn);
        await notifyAttendanceUsers(
          [mapping.user_id, ...directors],
          "REMOVED",
          "Attendance record removed",
          `The attendance record for ${previous.incident_date} (${mapping.name}) was cleared in Google Sheets.`,
          conn,
        );
      }

      await run(
        `INSERT INTO leave_balances
          (id, user_id, staff_group, cycle_label, expiry_date, total_allocation,
           leaves_this_month, leaves_this_year, rem_el, rem_sl, rem_vl, rem_bl,
           total_lates, carry_over_bl)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           leaves_this_month = VALUES(leaves_this_month),
           leaves_this_year = VALUES(leaves_this_year),
           rem_el = VALUES(rem_el), rem_sl = VALUES(rem_sl),
           rem_vl = VALUES(rem_vl), rem_bl = VALUES(rem_bl),
           total_lates = VALUES(total_lates), carry_over_bl = VALUES(carry_over_bl),
           staff_group = VALUES(staff_group), updated_at = CURRENT_TIMESTAMP`,
        [
          randomUUID(),
          mapping.user_id,
          group,
          CYCLE_LABEL,
          CYCLE_EXPIRY_DATE,
          BASE_ALLOCATION,
          parsed.balance.leavesThisMonth,
          parsed.balance.leavesThisYear,
          parsed.balance.remEl,
          parsed.balance.remSl,
          parsed.balance.remVl,
          parsed.balance.remBl,
          parsed.balance.totalLates,
          parsed.balance.carryOverBl,
        ],
        conn,
      );
      await run(
        "UPDATE employee_sheet_mappings SET employee_status_note = ? WHERE id = ?",
        [parsed.balance.employeeStatusNote, mapping.id],
        conn,
      );
    }
  });

  return { rowsSeen: matrix.rows.length, changesApplied };
}

export async function syncStaffGroup(input: unknown) {
  await requireAttendanceAdmin();
  const { staffGroup } = parseInput(attendanceSyncSchema, input);
  const source = await ensureSource(staffGroup);
  const logId = randomUUID();
  await run("INSERT INTO attendance_sync_logs (id, staff_group, status) VALUES (?, ?, 'RUNNING')", [
    logId,
    staffGroup,
  ]);
  await run("UPDATE sheet_sources SET sync_status = 'RUNNING', sync_message = NULL WHERE id = ?", [
    source.id,
  ]);
  try {
    const matrix = await readStaffMatrix(source);
    const result = await applySnapshot(staffGroup, matrix);
    await run(
      "UPDATE attendance_sync_logs SET status = 'SUCCESS', rows_seen = ?, changes_applied = ?, finished_at = NOW() WHERE id = ?",
      [result.rowsSeen, result.changesApplied, logId],
    );
    await run(
      "UPDATE sheet_sources SET sync_status = 'SUCCESS', last_synced_at = NOW(), sync_message = NULL WHERE id = ?",
      [source.id],
    );
    return { staffGroup, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    await run(
      "UPDATE attendance_sync_logs SET status = 'FAILED', message = ?, finished_at = NOW() WHERE id = ?",
      [message.slice(0, 500), logId],
    );
    await run("UPDATE sheet_sources SET sync_status = 'FAILED', sync_message = ? WHERE id = ?", [
      message.slice(0, 500),
      source.id,
    ]);
    throw error;
  }
}

export async function listMyAttendance() {
  const current = await requireEmployeeAttendanceViewer();
  const [mappingRows, balanceRows, logRows, flagRows, notificationRows] = await Promise.all([
    all<MappingRow[]>(
      "SELECT m.id, m.user_id, m.staff_group, m.sheet_employee_name, m.employee_status_note, u.name, u.email, u.role FROM employee_sheet_mappings m JOIN users u ON u.id = m.user_id WHERE m.user_id = ?",
      [current.id],
    ),
    all<RowDataPacket[]>(
      "SELECT staff_group, cycle_label, expiry_date, total_allocation, leaves_this_month, leaves_this_year, rem_el, rem_sl, rem_vl, rem_bl, total_lates, carry_over_bl, updated_at FROM leave_balances WHERE user_id = ? AND cycle_label = ? LIMIT 1",
      [current.id, CYCLE_LABEL],
    ),
    all<RowDataPacket[]>(
      "SELECT id, incident_date, day_of_week, code, leave_type, credited_days, synced_at FROM attendance_logs WHERE user_id = ? ORDER BY incident_date DESC",
      [current.id],
    ),
    all<RowDataPacket[]>(
      "SELECT id, attendance_log_id, message, status, hr_reply, created_at, resolved_at FROM leave_discrepancy_flags WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
      [current.id],
    ),
    all<RowDataPacket[]>(
      "SELECT id, event_type, heading, body, read_at, created_at FROM attendance_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
      [current.id],
    ),
  ]);
  return {
    mapping: mappingRows[0] ?? null,
    balance: balanceRows[0] ?? null,
    logs: logRows,
    flags: flagRows,
    notifications: notificationRows,
  };
}

export async function listDirectorAttendance(input: unknown) {
  await requireDirectorViewer();
  const { staffGroup } = parseInput(attendanceGroupSchema, input ?? {});
  const where = staffGroup ? "WHERE m.staff_group = ?" : "";
  const params = staffGroup ? [staffGroup] : [];
  const [logs, balances, notifications] = await Promise.all([
    all<RowDataPacket[]>(
      `SELECT a.id, a.incident_date, a.day_of_week, a.code, a.leave_type, a.credited_days,
              m.staff_group, m.sheet_employee_name, u.name, u.department
       FROM attendance_logs a
       JOIN employee_sheet_mappings m ON m.user_id = a.user_id AND m.staff_group = a.staff_group
       JOIN users u ON u.id = a.user_id
       ${where} ORDER BY a.incident_date DESC LIMIT 250`,
      params,
    ),
    all<RowDataPacket[]>(
      `SELECT b.staff_group, SUM(b.leaves_this_year) AS leaves_this_year,
              SUM(b.leaves_this_month) AS leaves_this_month, SUM(b.total_lates) AS total_lates
       FROM leave_balances b ${staffGroup ? "WHERE b.staff_group = ?" : ""}
       GROUP BY b.staff_group`,
      params,
    ),
    all<RowDataPacket[]>(
      "SELECT id, event_type, heading, body, created_at FROM attendance_notifications WHERE event_type IN ('ADDED','UPDATED','REMOVED') ORDER BY created_at DESC LIMIT 50",
    ),
  ]);
  return { logs, balances, notifications };
}

export async function listAttendanceAdmin(input: unknown) {
  await requireAttendanceAdmin();
  const { staffGroup } = parseInput(attendanceGroupSchema, input ?? {});
  const where = staffGroup ? "WHERE m.staff_group = ?" : "";
  const params = staffGroup ? [staffGroup] : [];
  const [mappings, balances, flags, sources, attendanceLogs] = await Promise.all([
    all<MappingRow[]>(
      `SELECT m.id, m.user_id, m.staff_group, m.sheet_employee_name, m.employee_status_note,
              u.name, u.email, u.role
       FROM employee_sheet_mappings m JOIN users u ON u.id = m.user_id
       ${where} ORDER BY m.staff_group, m.sheet_employee_name`,
      params,
    ),
    all<RowDataPacket[]>(
      `SELECT b.*, u.name, u.email FROM leave_balances b JOIN users u ON u.id = b.user_id
       ${staffGroup ? "WHERE b.staff_group = ?" : ""} ORDER BY u.name`,
      params,
    ),
    all<RowDataPacket[]>(
      `SELECT f.id, f.attendance_log_id, f.user_id, f.message, f.status, f.hr_reply, f.created_at,
              f.resolved_at, u.name, u.email
       FROM leave_discrepancy_flags f JOIN users u ON u.id = f.user_id
       WHERE f.status = 'OPEN' ORDER BY f.created_at DESC LIMIT 100`,
    ),
    all<SourceRow[]>(
      "SELECT id, staff_group, spreadsheet_id, sheet_name, last_synced_at, sync_status, sync_message FROM sheet_sources ORDER BY staff_group",
    ),
    all<RowDataPacket[]>(
      `SELECT a.incident_date, a.code, a.leave_type, a.credited_days, m.staff_group,
              m.sheet_employee_name, u.name FROM attendance_logs a
       JOIN employee_sheet_mappings m ON m.user_id = a.user_id AND m.staff_group = a.staff_group
       JOIN users u ON u.id = a.user_id ${where}
       ORDER BY a.incident_date DESC LIMIT 250`,
      params,
    ),
  ]);
  const users = await all<RowDataPacket[]>(
    "SELECT id, name, email, department, role FROM users ORDER BY name",
  );
  const syncLogs = await all<RowDataPacket[]>(
    "SELECT id, staff_group, status, rows_seen, changes_applied, message, started_at, finished_at FROM attendance_sync_logs ORDER BY started_at DESC LIMIT 50",
  );
  return { mappings, balances, flags, sources, logs: syncLogs, users, attendanceLogs };
}

export async function saveAttendanceMapping(input: unknown) {
  await requireAttendanceAdmin();
  const data = parseInput(attendanceMappingSchema, input);
  await run(
    `INSERT INTO employee_sheet_mappings
      (id, user_id, staff_group, sheet_employee_name, employee_status_note)
     VALUES (?, ?, ?, ?, NULL)
     ON DUPLICATE KEY UPDATE
       sheet_employee_name = VALUES(sheet_employee_name),
       employee_status_note = NULL`,
    [randomUUID(), data.userId, data.staffGroup, data.sheetEmployeeName],
  );
  return { ok: true as const };
}

export async function createAttendanceFlag(input: unknown) {
  const current = await requireEmployeeAttendanceViewer();
  const data = parseInput(attendanceFlagSchema, input);
  const rows = await all<RowDataPacket[]>(
    "SELECT id FROM attendance_logs WHERE id = ? AND user_id = ? LIMIT 1",
    [data.attendanceLogId, current.id],
  );
  if (!rows.length) throw new AppError("That attendance entry is not available.");
  await run(
    "INSERT INTO leave_discrepancy_flags (id, attendance_log_id, user_id, message) VALUES (?, ?, ?, ?)",
    [randomUUID(), data.attendanceLogId, current.id, data.message],
  );
  return { ok: true as const };
}

export async function resolveAttendanceFlag(input: unknown) {
  await requireAttendanceAdmin();
  const data = parseInput(attendanceFlagSchema, input);
  const result = await run(
    "UPDATE leave_discrepancy_flags SET status = 'RESOLVED', hr_reply = ?, resolved_at = NOW() WHERE id = ? AND status = 'OPEN'",
    [data.message, data.flagId],
  );
  if (!result.affectedRows) throw new AppError("That discrepancy flag is already resolved.");
  return { ok: true as const };
}

export async function listAttendanceNotifications() {
  const current = await requireAttendanceViewer();
  return all<RowDataPacket[]>(
    "SELECT id, event_type, heading, body, read_at, created_at FROM attendance_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
    [current.id],
  );
}

export async function markAttendanceNotificationRead(input: unknown) {
  const current = await requireAttendanceViewer();
  const id = String(input ?? "");
  const result = await run(
    "UPDATE attendance_notifications SET read_at = NOW() WHERE id = ? AND user_id = ?",
    [id, current.id],
  );
  if (!result.affectedRows) throw new AppError("That attendance notification was not found.");
  return { ok: true as const };
}

export async function syncFromWebhook(secret: string | null, input: unknown) {
  const configured = serverEnvOptional("LATE_ABSENCES_WEBHOOK_SECRET");
  if (!configured || !secret) throw new AppError("Webhook authentication failed.");
  const left = Buffer.from(configured);
  const right = Buffer.from(secret);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new AppError("Webhook authentication failed.");
  }
  const { staffGroup } = parseInput(attendanceSyncSchema, input);
  return syncStaffGroup({ staffGroup });
}
