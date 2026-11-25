import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { AppError, parseInput } from "@/lib/errors";
import {
  attendanceInstitutionalEmail,
  claimSchema,
  claimApprovalSchema,
  incidentResponseSchema,
  normalizeAttendanceName,
  sheetNameKey,
  sheetsSnapshotSchema,
} from "@/lib/attendance";
import { STAFF_GROUPS, parseStaffMatrix, type StaffGroup } from "@/lib/late-absences";
import { requireAttendanceSession } from "./attendance-auth";
import { attendanceAdminAllowed } from "@/lib/attendance-access";
import { all, run, withTransaction, type Db } from "./db";
import { serverEnvOptional } from "./env";

interface Profile extends RowDataPacket {
  id: string;
  department_group: StaffGroup;
  sheet_row_number: number;
  full_name: string;
  normalized_full_name: string;
  name_key: string;
  claimed_by_user_id: string | null;
  is_active: number;
  cycle_start: string;
  cycle_end: string;
  synced_at: string;
  remaining_el: string;
  remaining_sl: string;
  remaining_vl: string;
  remaining_bl: string;
  leaves_this_month: string;
  leaves_this_year: string;
  remarks: string | null;
}
interface Incident extends RowDataPacket {
  id: string;
  profile_id: string;
  incident_date: string;
  code: string;
  leave_type: string;
  credited_days: string;
  revision: number;
  is_active: number;
  acknowledged_at: string | null;
  explanation: string | null;
}
interface Claim extends RowDataPacket {
  id: string;
  user_id: string;
  department_group: StaffGroup;
  name_key: string;
  first_name: string;
  middle_initial: string;
  last_name: string;
  status: string;
  profile_id: string | null;
  requested_at: string;
  account_name: string;
  email: string;
}
interface Source extends RowDataPacket {
  id: string;
  staff_group: StaffGroup;
  spreadsheet_id: string;
  sync_status: string;
  last_synced_at: string | null;
  sync_message: string | null;
}
interface Audit extends RowDataPacket {
  id: string;
  department_group: StaffGroup;
  payload_hash: string;
  captured_at: string;
  status: string;
  rows_seen: number;
  changes_applied: number;
  message: string | null;
  started_at: string;
  finished_at: string | null;
}

export async function requireAttendanceEmployee() {
  const current = await requireAttendanceSession();
  if (!current || !attendanceInstitutionalEmail(current.email)) {
    throw new AppError("Sign in with your institutional account to view attendance.");
  }
  if (attendanceAdminAllowed(current)) {
    throw new AppError("Use the HRDO attendance administration panel.");
  }
  if (current.mustChangePassword || current.needsProfileCompletion) {
    throw new AppError("Complete your account setup before accessing attendance.");
  }
  return current;
}

export async function requireAttendanceAdmin() {
  const current = await requireAttendanceSession();
  if (!attendanceAdminAllowed(current)) {
    throw new AppError("Only HRDO administrators and Super Admins can manage attendance.");
  }
  if (current.mustChangePassword || current.needsProfileCompletion)
    throw new AppError("Complete your account setup before accessing attendance.");
  return { userId: current.id, hrdoUserId: current.hrdoUserId };
}

const isAlert = (code: string) => code === "LATE" || code === "ABSENT";
const sqlTime = (iso: string) => new Date(iso).toISOString().slice(0, 23).replace("T", " ");

async function notify(userId: string, code: string, date: string, db: Db) {
  await run(
    `INSERT INTO attendance_notifications (id, user_id, event_type, heading, body)
    VALUES (?, ?, 'ADDED', ?, ?)`,
    [
      randomUUID(),
      userId,
      `${code === "LATE" ? "Late arrival" : "Unexcused absence"} requires acknowledgment`,
      `${code} recorded for ${date}. Review it in My Leaves & Attendance.`,
    ],
    db,
  );
}

export async function getMyAttendance() {
  const current = await requireAttendanceEmployee();
  // The profile identity is always derived from the authenticated users.id.
  const profiles = await all<Profile[]>(
    "SELECT * FROM hr_sheet_profiles WHERE claimed_by_user_id = ?",
    [current.id],
  );
  const profile = profiles[0];
  const [claims, logs, notifications] = await Promise.all([
    all<Claim[]>(
      "SELECT status, first_name, middle_initial, last_name, department_group FROM attendance_profile_claims WHERE user_id = ?",
      [current.id],
    ),
    all<Incident[]>(
      `SELECT i.* FROM attendance_leave_incidents i
      JOIN hr_sheet_profiles p ON p.id = i.profile_id
      WHERE p.claimed_by_user_id = ? AND p.is_active = 1 AND i.is_active = 1
        AND i.incident_date BETWEEN p.cycle_start AND p.cycle_end
      ORDER BY i.incident_date DESC`,
      [current.id],
    ),
    all<
      Array<RowDataPacket & { id: string; heading: string; body: string; read_at: string | null }>
    >(
      "SELECT id, heading, body, read_at FROM attendance_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
      [current.id],
    ),
  ]);
  return {
    profile: profile
      ? {
          fullName: profile.full_name,
          departmentGroup: profile.department_group,
          active: Boolean(profile.is_active),
          cycleStart: profile.cycle_start,
          cycleEnd: profile.cycle_end,
          remainingEl: Number(profile.remaining_el),
          remainingSl: Number(profile.remaining_sl),
          remainingVl: Number(profile.remaining_vl),
          remainingBl: Number(profile.remaining_bl),
          leavesThisMonth: Number(profile.leaves_this_month),
          leavesThisYear: Number(profile.leaves_this_year),
          remarks: profile.remarks,
          syncedAt: profile.synced_at,
        }
      : null,
    claim: claims[0]
      ? {
          status: claims[0].status,
          firstName: claims[0].first_name,
          middleInitial: claims[0].middle_initial,
          lastName: claims[0].last_name,
          departmentGroup: claims[0].department_group,
        }
      : null,
    logs: logs.map((log) => ({
      id: log.id,
      date: log.incident_date,
      code: log.code,
      leaveType: log.leave_type,
      days: Number(log.credited_days),
      revision: log.revision,
      acknowledgedAt: log.acknowledged_at,
      explanation: log.explanation,
    })),
    notifications: notifications.map((n) => ({
      id: n.id,
      heading: n.heading,
      body: n.body,
      read: Boolean(n.read_at),
    })),
  };
}

export async function submitAttendanceClaim(input: unknown) {
  const current = await requireAttendanceEmployee();
  const data = parseInput(claimSchema, input);
  const key = `${normalizeAttendanceName(data.lastName)},${normalizeAttendanceName(data.firstName)}`;
  return withTransaction(async (db) => {
    // Lock the account even when it has no profile/claim yet (concurrent submissions).
    await all("SELECT id FROM users WHERE id = ? FOR UPDATE", [current.id], db);
    const bound = await all<Profile[]>(
      "SELECT id FROM hr_sheet_profiles WHERE claimed_by_user_id = ?",
      [current.id],
      db,
    );
    if (bound.length) throw new AppError("Your account already has an HRDO attendance record.");
    const matches = await all<Profile[]>(
      `SELECT id FROM hr_sheet_profiles
      WHERE department_group = ? AND name_key = ? AND is_active = 1`,
      [data.departmentGroup, key],
      db,
    );
    const status =
      matches.length > 1
        ? "DUPLICATE_REVIEW_REQUIRED"
        : matches.length === 1
          ? "PENDING_REVIEW"
          : "NO_MATCH_REVIEW_REQUIRED";
    // All matches are reviewed by HRDO, including an email that matches firstname.lastname.
    // No candidate names, profile IDs, row numbers or balances are returned to employees.
    await run(
      `INSERT INTO attendance_profile_claims
      (id, user_id, department_group, first_name, middle_initial, last_name, name_key, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE department_group = VALUES(department_group),
        first_name = VALUES(first_name), middle_initial = VALUES(middle_initial),
        last_name = VALUES(last_name), name_key = VALUES(name_key), status = VALUES(status),
        requested_at = CURRENT_TIMESTAMP(3)`,
      [
        randomUUID(),
        current.id,
        data.departmentGroup,
        data.firstName,
        data.middleInitial,
        data.lastName,
        key,
        status,
      ],
      db,
    );
    return { status };
  });
}

export async function respondToAttendanceIncident(input: unknown) {
  const current = await requireAttendanceEmployee();
  const data = parseInput(incidentResponseSchema, input);
  return withTransaction(async (db) => {
    const result = await run(
      `UPDATE attendance_leave_incidents i
    JOIN hr_sheet_profiles p ON p.id = i.profile_id
    SET i.acknowledged_at = COALESCE(i.acknowledged_at, CURRENT_TIMESTAMP(3)), i.acknowledged_by_user_id = ?,
      i.explanation = COALESCE(?, i.explanation)
    WHERE i.id = ? AND i.revision = ? AND p.claimed_by_user_id = ?
      AND p.is_active = 1 AND i.is_active = 1 AND i.code IN ('LATE','ABSENT')
      AND i.incident_date BETWEEN p.cycle_start AND p.cycle_end`,
      [current.id, data.explanation ?? null, data.incidentId, data.revision, current.id],
      db,
    );
    if (!result.affectedRows)
      throw new AppError("This attendance entry changed or is unavailable. Refresh and try again.");
    await run(
      `INSERT INTO attendance_incident_responses (incident_id, incident_revision, user_id, code, acknowledged_at, explanation)
    SELECT id, revision, acknowledged_by_user_id, code, acknowledged_at, explanation
    FROM attendance_leave_incidents WHERE id = ?
    ON DUPLICATE KEY UPDATE explanation = VALUES(explanation)`,
      [data.incidentId],
      db,
    );
    return { ok: true as const };
  });
}

export async function approveAttendanceClaim(input: unknown) {
  const actor = await requireAttendanceAdmin();
  const data = parseInput(claimApprovalSchema, input);
  const initial = await all<Claim[]>("SELECT * FROM attendance_profile_claims WHERE id = ?", [
    data.claimId,
  ]);
  if (!initial[0]) throw new AppError("That claim was not found.");
  return withTransaction(async (db) => {
    // Same source lock as sync: approval cannot race a row being removed/replaced.
    await all(
      "SELECT id FROM sheet_sources WHERE staff_group = ? FOR UPDATE",
      [initial[0]!.department_group],
      db,
    );
    await all("SELECT id FROM users WHERE id = ? FOR UPDATE", [initial[0]!.user_id], db);
    const claims = await all<Array<Claim & { role: string; is_super_admin: number }>>(
      "SELECT c.*, u.email, u.role, u.is_super_admin FROM attendance_profile_claims c JOIN users u ON u.id = c.user_id WHERE c.id = ? FOR UPDATE",
      [data.claimId],
      db,
    );
    const claim = claims[0];
    if (
      !claim ||
      !attendanceInstitutionalEmail(claim.email) ||
      claim.role === "admin" ||
      claim.is_super_admin
    )
      throw new AppError("The claim is unavailable.");
    if (claim.department_group !== initial[0]!.department_group)
      throw new AppError("The claim changed. Refresh before approving it.");
    if (claim.status === "APPROVED") {
      if (claim.profile_id === data.profileId) return { ok: true as const };
      throw new AppError("This claim was already approved for another row.");
    }
    const profiles = await all<Profile[]>(
      "SELECT * FROM hr_sheet_profiles WHERE id = ? FOR UPDATE",
      [data.profileId],
      db,
    );
    const profile = profiles[0];
    if (
      !profile ||
      !profile.is_active ||
      profile.department_group !== claim.department_group ||
      profile.name_key !== claim.name_key
    ) {
      throw new AppError(
        "Select an active row matching this claim's full given name, surname and department.",
      );
    }
    if (profile.claimed_by_user_id && profile.claimed_by_user_id !== claim.user_id) {
      throw new AppError("That sheet row is already linked to another account.");
    }
    const bound = await all<Profile[]>(
      "SELECT id FROM hr_sheet_profiles WHERE claimed_by_user_id = ?",
      [claim.user_id],
      db,
    );
    if (bound.some((p) => p.id !== profile.id))
      throw new AppError("That account is already linked to another row.");
    await run(
      "UPDATE hr_sheet_profiles SET claimed_by_user_id = ? WHERE id = ?",
      [claim.user_id, profile.id],
      db,
    );
    await run(
      `UPDATE attendance_profile_claims SET status = 'APPROVED', profile_id = ?,
      approved_by_user_id = ?, approved_by_hrdo_user_id = ?, approved_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [profile.id, actor.userId, actor.hrdoUserId, claim.id],
      db,
    );
    const alerts = await all<Incident[]>(
      `SELECT * FROM attendance_leave_incidents WHERE profile_id = ?
      AND is_active = 1 AND acknowledged_at IS NULL AND code IN ('LATE','ABSENT')
      AND incident_date BETWEEN ? AND ?`,
      [profile.id, profile.cycle_start, profile.cycle_end],
      db,
    );
    for (const alert of alerts) await notify(claim.user_id, alert.code, alert.incident_date, db);
    return { ok: true as const };
  });
}

export async function getAttendanceAdmin() {
  await requireAttendanceAdmin();
  const [sources, audits, claims, profiles, explanations] = await Promise.all([
    all<Source[]>("SELECT * FROM sheet_sources ORDER BY staff_group"),
    all<Audit[]>("SELECT * FROM sync_audit_logs ORDER BY started_at DESC LIMIT 50"),
    all<Claim[]>(`SELECT c.*, u.name AS account_name, u.email FROM attendance_profile_claims c
      JOIN users u ON u.id = c.user_id WHERE c.status <> 'APPROVED' ORDER BY c.requested_at`),
    all<Profile[]>(
      "SELECT * FROM hr_sheet_profiles WHERE is_active = 1 ORDER BY department_group, sheet_row_number",
    ),
    all<Array<Incident & { account_name: string; email: string; is_current: number }>>(`SELECT
      CONCAT(r.incident_id, ':', r.incident_revision) AS id, i.incident_date, r.code, r.explanation,
      r.acknowledged_at, (r.incident_revision = i.revision AND i.is_active = 1) AS is_current,
      u.name AS account_name, u.email FROM attendance_incident_responses r
      JOIN attendance_leave_incidents i ON i.id = r.incident_id
      JOIN users u ON u.id = r.user_id WHERE r.explanation IS NOT NULL
      ORDER BY r.acknowledged_at DESC LIMIT 100`),
  ]);
  return {
    sources: STAFF_GROUPS.map((group) => {
      const source = sources.find((s) => s.staff_group === group);
      return {
        group,
        status: source?.sync_status ?? "NEVER",
        syncedAt: source?.last_synced_at ?? null,
        message: source?.sync_message ?? null,
      };
    }),
    claims: claims.map((claim) => ({
      id: claim.id,
      accountName: claim.account_name,
      email: claim.email,
      group: claim.department_group,
      submittedName: `${claim.last_name}, ${claim.first_name} ${claim.middle_initial}`.trim(),
      status: claim.status,
      candidates: profiles
        .filter(
          (p) => p.department_group === claim.department_group && p.name_key === claim.name_key,
        )
        .map((p) => ({
          id: p.id,
          name: p.full_name,
          row: p.sheet_row_number,
          claimed: Boolean(p.claimed_by_user_id),
        })),
    })),
    logs: audits.map((log) => ({
      id: log.id,
      group: log.department_group,
      status: log.status,
      rows: log.rows_seen,
      changes: log.changes_applied,
      message: log.message,
      startedAt: log.started_at,
    })),
    explanations: explanations.map((i) => ({
      id: i.id,
      name: i.account_name,
      email: i.email,
      date: i.incident_date,
      code: i.code,
      explanation: i.explanation,
      acknowledgedAt: i.acknowledged_at,
      current: Boolean(i.is_current),
    })),
  };
}

export function authenticateSheetsWebhook(secret: string | null) {
  const expected = serverEnvOptional("HRDO_SHEETS_WEBHOOK_SECRET");
  if (!expected || !secret) throw new AppError("Webhook authentication failed.");
  const a = Buffer.from(expected),
    b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new AppError("Webhook authentication failed.");
}

export async function ingestSheetsSnapshot(input: unknown) {
  const data = parseInput(sheetsSnapshotSchema, input);
  const capturedAt = sqlTime(data.capturedAt);
  if (Date.parse(data.capturedAt) > Date.now() + 300_000)
    throw new AppError("Snapshot time is in the future.");
  const sources = await all<Source[]>("SELECT * FROM sheet_sources WHERE staff_group = ?", [
    data.departmentGroup,
  ]);
  const expectedId =
    serverEnvOptional(`LATE_ABSENCES_${data.departmentGroup}_SPREADSHEET_ID`) ??
    sources[0]?.spreadsheet_id;
  if (!expectedId || expectedId !== data.spreadsheetId)
    throw new AppError("The tracker ID does not match the configured department source.");
  await run(
    `INSERT INTO sheet_sources (id, staff_group, spreadsheet_id, sheet_name)
    VALUES (?, ?, ?, 'STAFF') ON DUPLICATE KEY UPDATE spreadsheet_id = VALUES(spreadsheet_id)`,
    [randomUUID(), data.departmentGroup, expectedId],
  );
  const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  await run(
    `INSERT IGNORE INTO sync_audit_logs (id, department_group, spreadsheet_id, payload_hash, captured_at, status)
    VALUES (?, ?, ?, ?, ?, 'RUNNING')`,
    [data.snapshotId, data.departmentGroup, data.spreadsheetId, hash, capturedAt],
  );
  // A replay with the same ID but different contents must never mutate the original audit.
  const originals = await all<Audit[]>("SELECT * FROM sync_audit_logs WHERE id = ?", [
    data.snapshotId,
  ]);
  if (originals[0]?.payload_hash !== hash)
    throw new AppError("Snapshot ID was already used for different contents.");
  try {
    return await withTransaction(async (db) => {
      await all(
        "SELECT id FROM sheet_sources WHERE staff_group = ? FOR UPDATE",
        [data.departmentGroup],
        db,
      );
      const attempts = await all<Audit[]>(
        "SELECT * FROM sync_audit_logs WHERE id = ? FOR UPDATE",
        [data.snapshotId],
        db,
      );
      if (attempts[0]?.status === "SUCCESS")
        return { duplicate: true, rowsSeen: attempts[0].rows_seen, changesApplied: 0 };
      const latest = await all<Audit[]>(
        `SELECT captured_at FROM sync_audit_logs
        WHERE department_group = ? AND status = 'SUCCESS' ORDER BY captured_at DESC LIMIT 1`,
        [data.departmentGroup],
        db,
      );
      if (latest[0] && latest[0].captured_at >= capturedAt) {
        await run(
          "UPDATE sync_audit_logs SET status = 'STALE', message = 'A newer snapshot is already applied.', finished_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
          [data.snapshotId],
          db,
        );
        return { stale: true, rowsSeen: 0, changesApplied: 0 };
      }
      let matrix;
      try {
        matrix = parseStaffMatrix(data.values.map((row) => row.map((v) => String(v ?? ""))));
      } catch (error) {
        throw new AppError(error instanceof Error ? error.message : "Invalid STAFF grid.");
      }
      const existing = await all<Profile[]>(
        "SELECT * FROM hr_sheet_profiles WHERE department_group = ? FOR UPDATE",
        [data.departmentGroup],
        db,
      );
      const byRow = new Map(existing.map((p) => [p.sheet_row_number, p]));
      // Fail the whole snapshot before changing anything if a row now names a different person.
      // An HR-reviewed data migration is required for sorting, insertion or identity corrections.
      for (const row of matrix.rows) {
        const old = byRow.get(row.sheetRowNumber);
        if (old && old.normalized_full_name !== normalizeAttendanceName(row.sheetEmployeeName)) {
          throw new AppError(
            `Identity changed at STAFF row ${row.sheetRowNumber}. HRDO must review the row move before syncing.`,
          );
        }
      }
      await run(
        "UPDATE hr_sheet_profiles SET is_active = 0 WHERE department_group = ?",
        [data.departmentGroup],
        db,
      );
      let changesApplied = 0;
      for (const row of matrix.rows) {
        const previous = byRow.get(row.sheetRowNumber);
        const profileId = previous?.id ?? randomUUID();
        const balance = row.balance;
        await run(
          `INSERT INTO hr_sheet_profiles
          (id, department_group, sheet_row_number, full_name, normalized_full_name, name_key,
           cycle_start, cycle_end, leaves_this_month, leaves_this_year, remaining_el, remaining_sl,
           remaining_vl, remaining_bl, remarks, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
          ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), is_active = 1,
            cycle_start = VALUES(cycle_start), cycle_end = VALUES(cycle_end),
            leaves_this_month = VALUES(leaves_this_month), leaves_this_year = VALUES(leaves_this_year),
            remaining_el = VALUES(remaining_el), remaining_sl = VALUES(remaining_sl),
            remaining_vl = VALUES(remaining_vl), remaining_bl = VALUES(remaining_bl),
            remarks = VALUES(remarks), synced_at = CURRENT_TIMESTAMP(3)`,
          [
            profileId,
            data.departmentGroup,
            row.sheetRowNumber,
            row.sheetEmployeeName,
            normalizeAttendanceName(row.sheetEmployeeName),
            sheetNameKey(row.sheetEmployeeName),
            matrix.cycleStart,
            matrix.cycleEnd,
            balance.leavesThisMonth,
            balance.leavesThisYear,
            balance.remEl,
            balance.remSl,
            balance.remVl,
            balance.remBl,
            balance.employeeStatusNote,
          ],
          db,
        );
        const oldLogs = await all<Incident[]>(
          `SELECT * FROM attendance_leave_incidents
          WHERE profile_id = ? AND incident_date BETWEEN ? AND ? FOR UPDATE`,
          [profileId, matrix.cycleStart, matrix.cycleEnd],
          db,
        );
        const logsByDate = new Map(oldLogs.map((log) => [log.incident_date, log]));
        const incomingDates = new Set(row.logs.map((log) => log.incidentDate));
        for (const log of row.logs) {
          const old = logsByDate.get(log.incidentDate);
          if (old?.is_active && old.code === log.code) continue;
          changesApplied += 1;
          await run(
            `INSERT INTO attendance_leave_incidents
            (id, profile_id, incident_date, code, leave_type, credited_days, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
            ON DUPLICATE KEY UPDATE code = VALUES(code), leave_type = VALUES(leave_type),
              credited_days = VALUES(credited_days), is_active = 1, revision = revision + 1,
              acknowledged_at = NULL, acknowledged_by_user_id = NULL, explanation = NULL,
              synced_at = CURRENT_TIMESTAMP(3)`,
            [
              old?.id ?? randomUUID(),
              profileId,
              log.incidentDate,
              log.code,
              log.leaveType,
              log.creditedDays,
            ],
            db,
          );
          if (previous?.claimed_by_user_id && isAlert(log.code)) {
            await notify(previous.claimed_by_user_id, log.code, log.incidentDate, db);
          }
        }
        for (const old of oldLogs) {
          if (old.is_active && !incomingDates.has(old.incident_date)) {
            changesApplied += 1;
            await run(
              "UPDATE attendance_leave_incidents SET is_active = 0, revision = revision + 1, synced_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
              [old.id],
              db,
            );
          }
        }
      }
      await run(
        `UPDATE sync_audit_logs SET status = 'SUCCESS', rows_seen = ?, changes_applied = ?,
        message = NULL, finished_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
        [matrix.rows.length, changesApplied, data.snapshotId],
        db,
      );
      await run(
        "UPDATE sheet_sources SET sync_status = 'SUCCESS', last_synced_at = NOW(), sync_message = NULL WHERE staff_group = ?",
        [data.departmentGroup],
        db,
      );
      return { rowsSeen: matrix.rows.length, changesApplied };
    });
  } catch (error) {
    // The snapshot transaction rolls back completely; retain the failed attempt separately.
    const message =
      error instanceof AppError ? error.message : "Database sync failed. Retry this snapshot.";
    await run(
      `UPDATE sync_audit_logs SET status = 'FAILED', message = ?, finished_at = CURRENT_TIMESTAMP(3)
      WHERE id = ? AND status <> 'SUCCESS'`,
      [message.slice(0, 500), data.snapshotId],
    );
    await run(
      `UPDATE sheet_sources SET sync_status = 'FAILED', sync_message = ? WHERE staff_group = ?
      AND NOT EXISTS (SELECT 1 FROM sync_audit_logs WHERE department_group = ? AND status = 'SUCCESS' AND captured_at >= ?)`,
      [message.slice(0, 500), data.departmentGroup, data.departmentGroup, capturedAt],
    );
    throw error;
  }
}
