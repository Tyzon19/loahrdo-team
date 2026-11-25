import { createHash, randomBytes, randomUUID } from "node:crypto";
import { deleteCookie, getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";
import type { RowDataPacket } from "mysql2/promise";
import type { Viewer, Role } from "@/lib/types";
import type { AttendanceViewer } from "@/lib/attendance-access";
import { attendanceDestination } from "@/lib/attendance-access";
import { attendanceInstitutionalEmail } from "@/lib/attendance";
import { AppError } from "@/lib/errors";
import { parseInput } from "@/lib/errors";
import { changePasswordSchema, loginSchema } from "@/lib/validation";
import { z } from "zod";
import { HRDO_BOOTSTRAP_ADMIN_EMAIL } from "@/lib/hrdo";
import { all, run, withTransaction } from "./db";
import { encryptedCookieRequired } from "./env";
import { DUMMY_HASH } from "./password";

export const ATTENDANCE_SESSION_COOKIE = "loa_attendance_session";
const HOURS = 8;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const cookieOptions = () => ({
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: encryptedCookieRequired() || getRequestHeader("x-forwarded-proto") === "https",
  maxAge: HOURS * 3600,
});
interface AttendanceAccount extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  department: string;
  role: Role;
  is_super_admin: number;
  must_change_password: number;
  profile_complete: number;
  password_hash: string;
  hrdo_id: string | null;
  hrdo_role: string | null;
  hrdo_external: number | null;
  hrdo_must_change_password: number | null;
}
const accountQuery = `SELECT u.id, u.name, u.email, u.department, u.role, u.is_super_admin, u.password_hash,
  u.must_change_password, u.profile_complete, h.id AS hrdo_id, h.role AS hrdo_role,
  h.is_external AS hrdo_external, h.must_change_password AS hrdo_must_change_password
  FROM users u LEFT JOIN hrdo_users h ON h.email = u.email`;

function mapAttendanceViewer(row: AttendanceAccount): AttendanceViewer | null {
  if (!attendanceInstitutionalEmail(row.email)) return null;
  if (row.role === "admin" && !row.is_super_admin) return null;
  const hrdoAdmin =
    !row.hrdo_external &&
    (row.hrdo_role === "hrdo_admin" || row.email.toLowerCase() === HRDO_BOOTSTRAP_ADMIN_EMAIL);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department,
    role: row.is_super_admin ? "SUPER_ADMIN" : hrdoAdmin ? "HRDO_ADMIN" : "EMPLOYEE",
    accountRole: row.role,
    hrdoUserId: hrdoAdmin ? row.hrdo_id : null,
    mustChangePassword: Boolean(
      row.must_change_password || (hrdoAdmin && row.hrdo_must_change_password),
    ),
    needsProfileCompletion: !row.profile_complete,
    canChangePassword: row.password_hash !== DUMMY_HASH,
  };
}

export async function attendanceViewer(): Promise<AttendanceViewer | null> {
  const token = getCookie(ATTENDANCE_SESSION_COOKIE);
  // Never fall back to the VHTT, COE or Permission Slip cookies.
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    if (token) deleteCookie(ATTENDANCE_SESSION_COOKIE, { path: "/" });
    return null;
  }
  const rows = await all<AttendanceAccount[]>(
    `${accountQuery}
    JOIN attendance_sessions s ON s.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > NOW() LIMIT 1`,
    [hash(token)],
  );
  const current = rows[0] ? mapAttendanceViewer(rows[0]) : null;
  if (!current) {
    deleteCookie(ATTENDANCE_SESSION_COOKIE, { path: "/" });
    return null;
  }
  await run(
    `UPDATE attendance_sessions SET last_seen_at = NOW(),
    expires_at = IF(expires_at < DATE_ADD(NOW(), INTERVAL 2 HOUR), DATE_ADD(NOW(), INTERVAL ? HOUR), expires_at)
    WHERE token_hash = ? AND last_seen_at < DATE_SUB(NOW(), INTERVAL 1 MINUTE)`,
    [HOURS, hash(token)],
  );
  setCookie(ATTENDANCE_SESSION_COOKIE, token, cookieOptions());
  return current;
}

export async function requireAttendanceSession() {
  const current = await attendanceViewer();
  if (!current) throw new AppError("Sign in to the Leave & Attendance system to continue.");
  return current;
}

export async function createAttendanceSession(userId: string) {
  const rows = await all<AttendanceAccount[]>(`${accountQuery} WHERE u.id = ? LIMIT 1`, [userId]);
  const current = rows[0] ? mapAttendanceViewer(rows[0]) : null;
  if (!current) throw new AppError("This account cannot access Leave & Attendance.");
  const old = getCookie(ATTENDANCE_SESSION_COOKIE);
  if (old) await run("DELETE FROM attendance_sessions WHERE token_hash = ?", [hash(old)]);
  const token = randomBytes(32).toString("base64url");
  await run(
    `INSERT INTO attendance_sessions (id,user_id,token_hash,user_agent,expires_at)
    VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [
      randomUUID(),
      userId,
      hash(token),
      (getRequestHeader("user-agent") ?? "").slice(0, 255),
      HOURS,
    ],
  );
  return { token, maxAge: HOURS * 3600, user: current };
}

async function startAttendanceSession(userId: string) {
  const { token, user } = await createAttendanceSession(userId);
  setCookie(ATTENDANCE_SESSION_COOKIE, token, cookieOptions());
  return user;
}

export async function attendanceLogin(input: unknown) {
  // Reuse existing password verification, rate limits and lockout behavior.
  // The trusted server callback issues only an Attendance session.
  const { login } = await import("./auth");
  const data = parseInput(loginSchema.extend({ redirect: z.string().optional() }).strict(), input);
  let current: AttendanceViewer | null = null;
  await login(data, async (userId) => {
    current = await startAttendanceSession(userId);
  });
  // The cookie was just written to the response, so it is not yet visible through
  // getCookie() on this request. Use the viewer returned by session creation.
  if (!current) throw new AppError("Sign in to the Leave & Attendance system to continue.");
  return { destination: attendanceDestination(current, data.redirect) };
}

export async function ensureAttendanceGoogleAccount(email: string, name?: string) {
  const normalized = email.trim().toLowerCase();
  if (!attendanceInstitutionalEmail(normalized))
    throw new AppError("Use your institutional Google account.");
  return withTransaction(async (db) => {
    const existing = await all<Array<RowDataPacket & { id: string }>>(
      "SELECT id FROM users WHERE email = ? FOR UPDATE",
      [normalized],
      db,
    );
    if (existing[0]) return existing[0].id;
    const linked = await all<
      Array<
        RowDataPacket & {
          id: string;
          name: string;
          department: string;
          password_hash: string;
          must_change_password: number;
        }
      >
    >(
      "SELECT id,name,department,password_hash,must_change_password FROM hrdo_users WHERE email = ? LIMIT 1",
      [normalized],
      db,
    );
    const id = randomUUID();
    const display = (
      linked[0]?.name ||
      name ||
      normalized.split("@")[0] ||
      "Institutional Employee"
    )
      .trim()
      .slice(0, 120);
    await run(
      `INSERT INTO users (id,name,email,password_hash,role,department,must_change_password,profile_complete)
      VALUES (?, ?, ?, ?, 'requisitioner', ?, ?, 1)`,
      [
        id,
        display,
        normalized,
        linked[0]?.password_hash ?? DUMMY_HASH,
        linked[0]?.department ?? "General",
        linked[0]?.must_change_password ?? 0,
      ],
      db,
    );
    // Creating a shared identity record does not grant access to the other systems.
    if (!linked[0])
      await run("INSERT INTO attendance_only_accounts (user_id) VALUES (?)", [id], db);
    return id;
  });
}

export async function attendanceLogout() {
  const token = getCookie(ATTENDANCE_SESSION_COOKIE);
  if (token) await run("DELETE FROM attendance_sessions WHERE token_hash = ?", [hash(token)]);
  deleteCookie(ATTENDANCE_SESSION_COOKIE, { path: "/" });
  return { ok: true as const };
}

/** Trusted adapter for existing account maintenance; grants no main session. */
async function attendanceAccountIdentity(): Promise<Viewer> {
  const current = await requireAttendanceSession();
  return { ...current, role: current.accountRole, isSuperAdmin: current.role === "SUPER_ADMIN" };
}
export async function completeAttendanceProfile(input: unknown) {
  const { completeProfileName } = await import("./auth");
  await completeProfileName(input, attendanceAccountIdentity);
  return { ok: true as const };
}
export async function changeAttendancePassword(input: unknown) {
  const current = await requireAttendanceSession();
  const data = parseInput(
    changePasswordSchema
      .extend({ confirmPassword: z.string() })
      .strict()
      .refine(
        (values) => values.newPassword === values.confirmPassword,
        "New passwords must match.",
      ),
    input,
  );
  const { changePassword } = await import("./auth");
  await changePassword(data, attendanceAccountIdentity, current.hrdoUserId, {
    table: "attendance_sessions",
    token: getCookie(ATTENDANCE_SESSION_COOKIE),
  });
  return { ok: true as const };
}
