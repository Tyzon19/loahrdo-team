import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  getRequestIP,
  setCookie,
} from "@tanstack/react-start/server";
import type { RowDataPacket } from "mysql2/promise";
import type { Role } from "@/lib/types";
import {
  permissionRoleFor,
  type PermissionRole,
  type PermissionViewer,
} from "@/lib/permission-access";
import { loginSchema, normaliseEmail } from "@/lib/validation";
import { AppError, parseInput } from "@/lib/errors";
import { encryptedCookieRequired } from "../env";
import { all, run } from "../db";
import { DUMMY_HASH, verifyPassword } from "../password";
import {
  clearLinkedLock,
  findLinkedAccount,
  linkUserProfile,
  recordLinkedFailure,
} from "../identity";

function sessionCookieName() {
  return "loa_permission_session";
}

function sessionHours() {
  return 8;
}

function sessionSeconds() {
  return sessionHours() * 3600;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

interface AccountRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  department: string;
  is_locked?: number;
  lock_minutes?: number | null;
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function isLocalEnvironmentIp(ip: string | null | undefined) {
  if (!ip || ip === "unknown") return true;
  return (
    ["127.0.0.1", "::1"].includes(ip) ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.")
  );
}

function checkIpRateLimit(ip: string) {
  if (isLocalEnvironmentIp(ip) || process.env["NODE_ENV"] !== "production") {
    return;
  }

  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 10 * 60_000 });
    if (loginAttempts.size > 5000) loginAttempts.clear();
    return;
  }
  entry.count += 1;
  if (entry.count > 60) {
    throw new AppError("Too many sign-in attempts. Please wait a few minutes and try again.");
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: encryptedCookieRequired(),
    path: "/",
    maxAge,
  };
}

function lockError(row: { lock_minutes?: number | null }) {
  const minutes = Math.max(1, Number(row.lock_minutes ?? LOCK_MINUTES));
  return new AppError(
    `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
  );
}

async function startSession(userId: string) {
  const cookieName = sessionCookieName();
  const previous = getCookie(cookieName);
  if (previous) {
    await run("DELETE FROM permission_sessions WHERE token_hash = ?", [sha256(previous)]);
  }

  const token = randomBytes(32).toString("base64url");
  const userAgent = (getRequestHeader("user-agent") ?? "").slice(0, 255);
  await run(
    `INSERT INTO permission_sessions (id, user_id, token_hash, user_agent, expires_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [randomUUID(), userId, sha256(token), userAgent, sessionHours()],
  );
  await run("DELETE FROM permission_sessions WHERE expires_at < DATE_SUB(NOW(), INTERVAL 7 DAY)");
  setCookie(cookieName, token, cookieOptions(sessionSeconds()));
}

function clearSessionCookie() {
  deleteCookie(sessionCookieName(), { path: "/" });
}

export async function permissionViewer(): Promise<PermissionViewer | null> {
  const cookieName = sessionCookieName();
  const token = getCookie(cookieName);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    if (token) clearSessionCookie();
    return null;
  }
  const hash = sha256(token);
  const rows = await all<AccountRow[]>(
    `SELECT u.id, u.name, u.email, u.role, u.department
     FROM permission_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > NOW()
     LIMIT 1`,
    [hash],
  );
  const row = rows[0];
  if (!row) {
    clearSessionCookie();
    return null;
  }

  await run(
    `UPDATE permission_sessions
     SET last_seen_at = NOW(),
         expires_at = IF(expires_at < DATE_ADD(NOW(), INTERVAL 2 HOUR), DATE_ADD(NOW(), INTERVAL ? HOUR), expires_at)
     WHERE token_hash = ?
       AND last_seen_at < DATE_SUB(NOW(), INTERVAL 1 MINUTE)`,
    [sessionHours(), hash],
  );
  setCookie(cookieName, token, cookieOptions(sessionSeconds()));
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: permissionRoleFor(row),
    department: row.department,
  };
}

export async function requirePermissionViewer(): Promise<PermissionViewer> {
  const current = await permissionViewer();
  if (!current) throw new AppError("Please sign in to continue.");
  return current;
}

/**
 * Signs in with the same institutional account used by the other LOA systems.
 * The account keeps its own Permission Slip role: the designated HRDO director
 * approves, everybody else is an ordinary employee.
 */
export async function permissionLogin(input: unknown): Promise<{ role: PermissionRole }> {
  const data = parseInput(loginSchema, input);
  const email = normaliseEmail(data.email);

  checkIpRateLimit(getRequestIP() ?? "unknown");

  const invalid = new AppError("Incorrect email or password.");
  const rows = await all<AccountRow[]>(
    `SELECT id, name, email, password_hash, role, department,
            (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked,
            TIMESTAMPDIFF(MINUTE, NOW(), locked_until) AS lock_minutes
     FROM users WHERE email = ? LIMIT 1`,
    [email],
  );
  const user = rows[0];

  if (user?.is_locked) throw lockError(user);

  if (user && (await verifyPassword(data.password, user.password_hash))) {
    await run("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?", [user.id]);
    await startSession(user.id);
    return { role: permissionRoleFor(user) };
  }

  // Accounts that only exist in the COE store can still sign in here. They get
  // a plain employee profile, because Permission Slip powers are granted to the
  // designated director only.
  const linked = await findLinkedAccount(email);
  if (linked) {
    if (linked.is_locked) throw lockError(linked);
    if (await verifyPassword(data.password, linked.password_hash)) {
      const userId = await linkUserProfile(linked);
      await clearLinkedLock(linked);
      await startSession(userId);
      return { role: "employee" };
    }
    await recordLinkedFailure(linked);
  }

  if (user) {
    await run(
      `UPDATE users SET failed_attempts = failed_attempts + 1,
        locked_until = IF(failed_attempts + 1 >= ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), locked_until)
       WHERE id = ?`,
      [MAX_FAILED_ATTEMPTS, LOCK_MINUTES, user.id],
    );
  } else {
    await verifyPassword(data.password, DUMMY_HASH);
  }
  throw invalid;
}

export async function permissionLogout(): Promise<{ ok: true }> {
  const token = getCookie(sessionCookieName());
  if (token) await run("DELETE FROM permission_sessions WHERE token_hash = ?", [sha256(token)]);
  clearSessionCookie();
  return { ok: true };
}
