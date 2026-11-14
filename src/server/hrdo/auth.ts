import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  getRequestIP,
  setCookie,
} from "@tanstack/react-start/server";
import type { RowDataPacket } from "mysql2/promise";
import type { HrdoRole, HrdoViewer } from "@/lib/hrdo";
import { hrdoViewerFromAdminPortal } from "@/lib/hrdo";
import { viewer } from "@/server/auth";
import { joinFullName } from "@/lib/name";
import {
  changePasswordSchema,
  institutionalEmailAllowed,
  loginSchema,
  namePartsSchema,
  normaliseEmail,
  passwordIssues,
  profileSchema,
  registrationOtpSchema,
  registerSchema,
  passwordRecoveryRequestSchema,
  passwordRecoverySchema,
} from "@/lib/validation";
import { encryptedCookieRequired, serverEnv, serverEnvOptional } from "../env";
import { all, run, withTransaction } from "../db";
import { AppError, isDuplicateKey, parseInput } from "@/lib/errors";
import { DUMMY_HASH, hashPassword, verifyPassword } from "../password";
import { sendRegistrationOtpEmail } from "../gmail";
function sessionCookieName() {
  return "loa_hrdo_session";
}
export function hrdoSessionCookieName() {
  return sessionCookieName();
}
function sessionHours() {
  return 8;
}
function sessionSeconds() {
  return sessionHours() * 3600;
}
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const REGISTRATION_OTP_MINUTES = 10;
const REGISTRATION_OTP_RESEND_SECONDS = 60;
const REGISTRATION_OTP_MAX_ATTEMPTS = 5;
const PASSWORD_RECOVERY_MINUTES = 10;

interface HrdoUserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: HrdoRole;
  is_external?: number;
  department: string;
  must_change_password: number;
  is_super_admin?: number;
  is_locked?: number;
  lock_minutes?: number | null;
}

interface RecoveryOtpRow extends RowDataPacket {
  code_hash: string;
  expires_at: string;
  attempts: number;
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

function mapViewer(row: HrdoUserRow): HrdoViewer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.is_super_admin && !row.is_external ? "hrdo_admin" : row.role,
    department: row.department,
    mustChangePassword: Boolean(row.must_change_password),
    isExternal: Boolean(row.is_external),
    isSuperAdmin: Boolean(row.is_super_admin),
  };
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

export async function hrdoCreateSession(userId: string) {
  const cookieName = sessionCookieName();
  const previous = getCookie(cookieName);
  if (previous) {
    await run("DELETE FROM hrdo_sessions WHERE token_hash = ?", [sha256(previous)]);
  }

  const token = randomBytes(32).toString("base64url");
  const userAgent = (getRequestHeader("user-agent") ?? "").slice(0, 255);
  await run(
    `INSERT INTO hrdo_sessions (id, user_id, token_hash, user_agent, expires_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [randomUUID(), userId, sha256(token), userAgent, sessionHours()],
  );
  await run("DELETE FROM hrdo_sessions WHERE expires_at < DATE_SUB(NOW(), INTERVAL 7 DAY)");
  return { token, maxAge: sessionSeconds() };
}

export interface HrdoGoogleSignInAccount {
  id: string;
  role: HrdoRole;
  mustChangePassword: boolean;
}

export interface HrdoGoogleSignInResult extends HrdoGoogleSignInAccount {
  /** True when this sign-in created the account, so the name must be completed. */
  isNew: boolean;
}

export async function hrdoGoogleSignInAccount(
  email: string,
): Promise<HrdoGoogleSignInAccount | null> {
  const rows = await all<HrdoUserRow[]>(
    `SELECT h.id, h.name, h.email, h.password_hash,
            CASE WHEN h.is_external = 0 AND COALESCE(m.is_super_admin, 0) = 1
                 THEN 'hrdo_admin' ELSE h.role END AS role,
            h.is_external, h.department, h.must_change_password,
            COALESCE(m.is_super_admin, 0) AS is_super_admin
     FROM hrdo_users h
     LEFT JOIN users m ON m.email = h.email
     WHERE h.email = ? LIMIT 1`,
    [normaliseEmail(email)],
  );
  const row = rows[0];
  return row
    ? { id: row.id, role: row.role, mustChangePassword: Boolean(row.must_change_password) }
    : null;
}

export async function ensureHrdoGoogleAccount(
  email: string,
  allowExternal = false,
): Promise<HrdoGoogleSignInResult> {
  const normalised = normaliseEmail(email);
  if (allowExternal && institutionalEmailAllowed(normalised)) {
    throw new AppError(
      "Use a personal Google account. Institutional accounts are for current employees.",
    );
  }
  const existing = await hrdoGoogleSignInAccount(normalised);
  if (existing) {
    const linkedUsers = await all<
      Array<RowDataPacket & { name: string; department: string; is_super_admin: number }>
    >("SELECT name, department, is_super_admin FROM users WHERE email = ? LIMIT 1", [normalised]);
    const linkedUser = linkedUsers[0];
    if (linkedUser?.name?.trim()) {
      await run("UPDATE hrdo_users SET name = ?, department = ? WHERE id = ?", [
        linkedUser.name.trim(),
        linkedUser.department?.trim() || "General",
        existing.id,
      ]);
    }
    return { ...existing, isNew: false };
  }

  if (!allowExternal && !institutionalEmailAllowed(normalised)) {
    throw new AppError("Use your official Lyceum of Alabang email address.");
  }

  const linkedUsers = await all<
    Array<RowDataPacket & { name: string; department: string; is_super_admin: number }>
  >("SELECT name, department, is_super_admin FROM users WHERE email = ? LIMIT 1", [normalised]);
  const linkedUser = linkedUsers[0];
  const localName = (normalised.split("@")[0] ?? "").replace(/[._-]+/g, " ").trim();
  const name = linkedUser?.name?.trim() || localName || "Institutional User";
  const department = linkedUser?.department?.trim() || "General";
  const role: HrdoRole = !allowExternal && linkedUser?.is_super_admin ? "hrdo_admin" : "employee";
  const id = randomUUID();
  await run(
    `INSERT INTO hrdo_users
       (id, name, email, password_hash, role, is_external, department, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, name, normalised, DUMMY_HASH, role, allowExternal ? 1 : 0, department],
  );

  return { id, role, mustChangePassword: false, isNew: true };
}

async function startSession(userId: string) {
  const cookieName = sessionCookieName();
  const previous = getCookie(cookieName);
  if (previous) {
    await run("DELETE FROM hrdo_sessions WHERE token_hash = ?", [sha256(previous)]);
  }

  const token = randomBytes(32).toString("base64url");
  const userAgent = (getRequestHeader("user-agent") ?? "").slice(0, 255);
  await run(
    `INSERT INTO hrdo_sessions (id, user_id, token_hash, user_agent, expires_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [randomUUID(), userId, sha256(token), userAgent, sessionHours()],
  );
  await run("DELETE FROM hrdo_sessions WHERE expires_at < DATE_SUB(NOW(), INTERVAL 7 DAY)");
  setCookie(cookieName, token, cookieOptions(sessionSeconds()));
}

function clearSessionCookie() {
  deleteCookie(sessionCookieName(), { path: "/" });
}

export async function hrdoViewer(): Promise<HrdoViewer | null> {
  const adminPortalViewer = hrdoViewerFromAdminPortal(await viewer());
  if (adminPortalViewer) return adminPortalViewer;

  const cookieName = sessionCookieName();
  const token = getCookie(cookieName);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    if (token) clearSessionCookie();
    return null;
  }
  const hash = sha256(token);
  const rows = await all<HrdoUserRow[]>(
    `SELECT u.id, u.name, u.email, u.role, u.is_external, u.department, u.must_change_password,
            COALESCE(m.is_super_admin, 0) AS is_super_admin
     FROM hrdo_sessions s
     JOIN hrdo_users u ON u.id = s.user_id
     LEFT JOIN users m ON m.email = u.email
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
    `UPDATE hrdo_sessions
     SET last_seen_at = NOW(),
         expires_at = IF(expires_at < DATE_ADD(NOW(), INTERVAL 2 HOUR), DATE_ADD(NOW(), INTERVAL ? HOUR), expires_at)
     WHERE token_hash = ?
       AND last_seen_at < DATE_SUB(NOW(), INTERVAL 1 MINUTE)`,
    [sessionHours(), hash],
  );
  setCookie(cookieName, token, cookieOptions(sessionSeconds()));
  return mapViewer(row);
}

export async function requireHrdoViewer(): Promise<HrdoViewer> {
  const current = await hrdoViewer();
  if (!current) throw new AppError("Please sign in to continue.");
  return current;
}

export async function hrdoLogin(input: unknown): Promise<{ mustChangePassword: boolean }> {
  const data = parseInput(loginSchema, input);
  const email = normaliseEmail(data.email);

  checkIpRateLimit(getRequestIP() ?? "unknown");

  const rows = await all<HrdoUserRow[]>(
    `SELECT id, name, email, password_hash, role, is_external, department, must_change_password,
            (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked,
            TIMESTAMPDIFF(MINUTE, NOW(), locked_until) AS lock_minutes
     FROM hrdo_users WHERE email = ? LIMIT 1`,
    [email],
  );
  const invalid = new AppError("Incorrect email or password.");

  let user = rows[0];
  if (!user) {
    const requisitionerRows = await all<
      Array<
        RowDataPacket & {
          id: string;
          name: string;
          email: string;
          password_hash: string;
          department: string;
          must_change_password: number;
          is_locked: number;
          lock_minutes: number | null;
        }
      >
    >(
      `SELECT id, name, email, password_hash, department, must_change_password,
              (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked,
              TIMESTAMPDIFF(MINUTE, NOW(), locked_until) AS lock_minutes
       FROM users WHERE email = ? LIMIT 1`,
      [email],
    );
    const requisitioner = requisitionerRows[0];
    if (!requisitioner) {
      await verifyPassword(data.password, DUMMY_HASH);
      throw invalid;
    }

    if (requisitioner.is_locked) {
      const minutes = Math.max(1, Number(requisitioner.lock_minutes ?? LOCK_MINUTES));
      throw new AppError(
        `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      );
    }

    if (!(await verifyPassword(data.password, requisitioner.password_hash))) {
      await run(
        `UPDATE users SET failed_attempts = failed_attempts + 1,
          locked_until = IF(failed_attempts + 1 >= ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), locked_until)
         WHERE id = ?`,
        [MAX_FAILED_ATTEMPTS, LOCK_MINUTES, requisitioner.id],
      );
      throw invalid;
    }

    await run(
      `INSERT INTO hrdo_users (id, name, email, password_hash, role, department, must_change_password)
       VALUES (?, ?, ?, ?, 'employee', ?, ?)`,
      [
        requisitioner.id,
        requisitioner.name,
        requisitioner.email,
        requisitioner.password_hash,
        requisitioner.department,
        requisitioner.must_change_password,
      ],
    );
    const linkedRows = await all<HrdoUserRow[]>(
      `SELECT id, name, email, password_hash, role, is_external, department, must_change_password,
              0 AS is_locked, NULL AS lock_minutes
       FROM hrdo_users WHERE id = ? LIMIT 1`,
      [requisitioner.id],
    );
    user = linkedRows[0];
  }

  if (!user) throw new AppError("We couldn't sign you in. Please try again.");
  if (user.is_locked) {
    const minutes = Math.max(1, Number(user.lock_minutes ?? LOCK_MINUTES));
    throw new AppError(
      `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    );
  }

  const valid = await verifyPassword(data.password, user.password_hash);
  if (!valid) {
    if (user.role === "employee") {
      const requisitionerRows = await all<Array<RowDataPacket & { password_hash: string }>>(
        "SELECT password_hash FROM users WHERE email = ? LIMIT 1",
        [email],
      );
      const requisitioner = requisitionerRows[0];
      if (requisitioner && (await verifyPassword(data.password, requisitioner.password_hash))) {
        await withTransaction(async (conn) => {
          await run(
            "UPDATE hrdo_users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?",
            [requisitioner.password_hash, user.id],
            conn,
          );
          await run(
            "UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE email = ? AND role = 'requisitioner'",
            [email],
            conn,
          );
        });
        await startSession(user.id);
        return { mustChangePassword: Boolean(user.must_change_password) };
      }
    }

    await run(
      `UPDATE hrdo_users SET failed_attempts = failed_attempts + 1,
        locked_until = IF(failed_attempts + 1 >= ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), locked_until)
       WHERE id = ?`,
      [MAX_FAILED_ATTEMPTS, LOCK_MINUTES, user.id],
    );
    throw invalid;
  }

  await run("UPDATE hrdo_users SET failed_attempts = 0, locked_until = NULL WHERE id = ?", [
    user.id,
  ]);
  await startSession(user.id);
  return { mustChangePassword: Boolean(user.must_change_password) };
}

export async function requestHrdoPasswordRecovery(input: unknown): Promise<{ sent: true }> {
  const { email } = parseInput(passwordRecoveryRequestSchema, input);
  const rows = await all<HrdoUserRow[]>(
    "SELECT id, name, email, password_hash, role, department, must_change_password FROM hrdo_users WHERE email = ? LIMIT 1",
    [normaliseEmail(email)],
  );
  const user = rows[0];
  if (!user) return { sent: true };
  const pending = await all<Array<RowDataPacket & { seconds_since_sent: number }>>(
    `SELECT TIMESTAMPDIFF(SECOND, last_sent_at, NOW()) AS seconds_since_sent
       FROM hrdo_registration_otps WHERE email = ? LIMIT 1`,
    [user.email],
  );
  const secondsSinceSent = Number(pending[0]?.seconds_since_sent ?? 60);
  if (secondsSinceSent < REGISTRATION_OTP_RESEND_SECONDS) {
    throw new AppError(
      `Please wait ${Math.max(1, REGISTRATION_OTP_RESEND_SECONDS - secondsSinceSent)} seconds before requesting another code.`,
    );
  }
  const code = String(randomInt(100000, 1000000));
  await run(
    `INSERT INTO hrdo_registration_otps
      (email, name, department, password_hash, code_hash, send_nonce, attempts, last_sent_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE))
     ON DUPLICATE KEY UPDATE name = VALUES(name), department = VALUES(department),
       password_hash = VALUES(password_hash), code_hash = VALUES(code_hash),
       send_nonce = VALUES(send_nonce), attempts = 0, last_sent_at = NOW(),
       expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)`,
    [
      user.email,
      user.name,
      user.department,
      user.password_hash,
      createHash("sha256").update(code).digest("hex"),
      randomUUID(),
      PASSWORD_RECOVERY_MINUTES,
      PASSWORD_RECOVERY_MINUTES,
    ],
  );
  await sendRegistrationOtpEmail(user.email, user.name, code, PASSWORD_RECOVERY_MINUTES);
  return { sent: true };
}

export async function resetHrdoPasswordWithRecoveryCode(input: unknown): Promise<{ reset: true }> {
  const data = parseInput(passwordRecoverySchema, input);
  const email = normaliseEmail(data.email);
  const users = await all<HrdoUserRow[]>(
    "SELECT id, role FROM hrdo_users WHERE email = ? LIMIT 1",
    [email],
  );
  const user = users[0];
  const otps = await all<RecoveryOtpRow[]>(
    "SELECT code_hash, expires_at, attempts FROM hrdo_registration_otps WHERE email = ? LIMIT 1",
    [email],
  );
  const otp = otps[0];
  if (
    !user ||
    !otp ||
    otp.expires_at <= new Date().toISOString().slice(0, 19).replace("T", " ") ||
    otp.attempts >= REGISTRATION_OTP_MAX_ATTEMPTS
  ) {
    throw new AppError("The recovery code is invalid or expired.");
  }
  const codeHash = createHash("sha256").update(data.code).digest("hex");
  if (otp.code_hash !== codeHash) {
    await run("UPDATE hrdo_registration_otps SET attempts = attempts + 1 WHERE email = ?", [email]);
    throw new AppError("The recovery code is invalid or expired.");
  }
  const passwordHash = await hashPassword(data.newPassword);
  await withTransaction(async (conn) => {
    await run(
      "UPDATE hrdo_users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, must_change_password = 0 WHERE id = ?",
      [passwordHash, user.id],
      conn,
    );
    if (user.role === "employee") {
      await run(
        "UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, must_change_password = 0 WHERE email = ? AND role = 'requisitioner'",
        [passwordHash, email],
        conn,
      );
      await run("DELETE FROM hrdo_sessions WHERE user_id = ?", [user.id], conn);
      await run(
        "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ? AND role = 'requisitioner')",
        [email],
        conn,
      );
    } else {
      await run("DELETE FROM hrdo_sessions WHERE user_id = ?", [user.id], conn);
    }
    await run("DELETE FROM hrdo_registration_otps WHERE email = ?", [email], conn);
  });
  return { reset: true };
}

interface HrdoRegistrationOtpRow extends RowDataPacket {
  name: string;
  department: string;
  password_hash: string;
  code_hash: string;
  send_nonce: string;
  attempts: number;
  seconds_since_sent: number;
  expired: number;
}

function registrationOtpHash(email: string, code: string): string {
  return createHmac("sha256", serverEnv("GOOGLE_CLIENT_SECRET"))
    .update(`${email}:${code}`)
    .digest("hex");
}

export async function hrdoRequestRegistrationOtp(input: unknown): Promise<{ sent: true }> {
  const data = parseInput(registerSchema, input);
  const email = normaliseEmail(data.email);

  if (
    !serverEnvOptional("GOOGLE_CLIENT_ID") ||
    !serverEnvOptional("GOOGLE_CLIENT_SECRET") ||
    !serverEnvOptional("GOOGLE_REFRESH_TOKEN") ||
    !serverEnvOptional("GOOGLE_SENDER_EMAIL")
  ) {
    throw new AppError(
      "Email verification is not connected yet. Please contact the HRDO desk for assistance.",
    );
  }

  if (!institutionalEmailAllowed(email)) {
    throw new AppError("Use your official Lyceum of Alabang email address.", {
      email: "Use your official @lyceumalabang.edu.ph email address.",
    });
  }

  const passwordProblem = passwordIssues(data.password)[0];
  if (passwordProblem) throw new AppError(`Password needs ${passwordProblem}.`);

  const existing = await all<RowDataPacket[]>("SELECT id FROM hrdo_users WHERE email = ? LIMIT 1", [
    email,
  ]);
  if (existing.length) {
    throw new AppError("An HRDO account with this email already exists. Sign in instead.", {
      email: "An HRDO account with this email already exists.",
    });
  }

  const passwordHash = await hashPassword(data.password);
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const codeHash = registrationOtpHash(email, code);
  const sendNonce = randomUUID();

  await withTransaction(async (conn) => {
    await run(
      `INSERT INTO hrdo_registration_otps
       (email, name, department, password_hash, code_hash, send_nonce, attempts, last_sent_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE))
       ON DUPLICATE KEY UPDATE
         name = IF(last_sent_at <= DATE_SUB(NOW(), INTERVAL 60 SECOND), VALUES(name), name),
         department = IF(last_sent_at <= DATE_SUB(NOW(), INTERVAL 60 SECOND), VALUES(department), department),
         password_hash = IF(last_sent_at <= DATE_SUB(NOW(), INTERVAL 60 SECOND), VALUES(password_hash), password_hash),
         code_hash = IF(last_sent_at <= DATE_SUB(NOW(), INTERVAL 60 SECOND), VALUES(code_hash), code_hash),
         send_nonce = IF(last_sent_at <= DATE_SUB(NOW(), INTERVAL 60 SECOND), VALUES(send_nonce), send_nonce),
         attempts = IF(last_sent_at <= DATE_SUB(NOW(), INTERVAL 60 SECOND), 0, attempts),
         expires_at = IF(last_sent_at <= DATE_SUB(NOW(), INTERVAL 60 SECOND), VALUES(expires_at), expires_at),
         last_sent_at = IF(last_sent_at <= DATE_SUB(NOW(), INTERVAL 60 SECOND), NOW(), last_sent_at)`,
      [
        email,
        data.name,
        "General",
        passwordHash,
        codeHash,
        sendNonce,
        REGISTRATION_OTP_MINUTES,
      ],
      conn,
    );
    const pending = await all<HrdoRegistrationOtpRow[]>(
      `SELECT send_nonce, TIMESTAMPDIFF(SECOND, last_sent_at, NOW()) AS seconds_since_sent
         FROM hrdo_registration_otps WHERE email = ?`,
      [email],
      conn,
    );
    if (pending[0]?.send_nonce !== sendNonce) {
      const seconds = Number(pending[0]?.seconds_since_sent ?? 0);
      throw new AppError(
        `Please wait ${Math.max(1, REGISTRATION_OTP_RESEND_SECONDS - seconds)} seconds before requesting another code.`,
        { email: "A verification code was just sent to this address." },
      );
    }
  });

  try {
    await sendRegistrationOtpEmail(email, data.name, code, REGISTRATION_OTP_MINUTES);
  } catch (error) {
    await run("DELETE FROM hrdo_registration_otps WHERE email = ? AND code_hash = ?", [
      email,
      codeHash,
    ]);
    throw error;
  }
  return { sent: true };
}

export async function hrdoVerifyRegistrationOtp(
  input: unknown,
): Promise<{ mustChangePassword: boolean }> {
  const data = parseInput(registrationOtpSchema, input);
  const email = normaliseEmail(data.email);
  const candidateHash = registrationOtpHash(email, data.code);

  let registrationError: AppError | undefined;
  let userId: string | undefined;
  try {
    const outcome = await withTransaction(async (conn) => {
      const rows = await all<HrdoRegistrationOtpRow[]>(
        `SELECT name, department, password_hash, code_hash, attempts,
                TIMESTAMPDIFF(SECOND, last_sent_at, NOW()) AS seconds_since_sent,
                (expires_at <= NOW()) AS expired
         FROM hrdo_registration_otps WHERE email = ? FOR UPDATE`,
        [email],
        conn,
      );
      const pending = rows[0];
      if (!pending) {
        return new AppError("That verification code is no longer valid. Request a new code.");
      }
      if (pending.expired) {
        await run("DELETE FROM hrdo_registration_otps WHERE email = ?", [email], conn);
        return new AppError("That verification code has expired. Request a new code.");
      }

      const expectedHash = Buffer.from(pending.code_hash, "hex");
      const suppliedHash = Buffer.from(candidateHash, "hex");
      if (
        expectedHash.length !== suppliedHash.length ||
        !timingSafeEqual(expectedHash, suppliedHash)
      ) {
        const attempts = Number(pending.attempts) + 1;
        if (attempts >= REGISTRATION_OTP_MAX_ATTEMPTS) {
          await run("DELETE FROM hrdo_registration_otps WHERE email = ?", [email], conn);
          return new AppError("Too many incorrect codes. Request a new verification code.");
        }
        await run(
          "UPDATE hrdo_registration_otps SET attempts = ? WHERE email = ?",
          [attempts, email],
          conn,
        );
        return new AppError(
          `That code is incorrect. ${REGISTRATION_OTP_MAX_ATTEMPTS - attempts} attempts remaining.`,
          { code: "Check the code and try again." },
        );
      }

      const existing = await all<RowDataPacket[]>(
        "SELECT id FROM hrdo_users WHERE email = ? LIMIT 1",
        [email],
        conn,
      );
      if (existing.length) {
        await run("DELETE FROM hrdo_registration_otps WHERE email = ?", [email], conn);
        return new AppError("An HRDO account with this email already exists. Sign in instead.", {
          email: "An HRDO account with this email already exists.",
        });
      }

      userId = randomUUID();
      await run(
        `INSERT INTO hrdo_users (id, name, email, password_hash, role, department, must_change_password)
         VALUES (?, ?, ?, ?, 'employee', ?, 0)`,
        [userId, pending.name, email, pending.password_hash, pending.department],
        conn,
      );
      await run("DELETE FROM hrdo_registration_otps WHERE email = ?", [email], conn);
      return null;
    });
    registrationError = outcome ?? undefined;
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError("An HRDO account with this email already exists. Sign in instead.", {
        email: "An HRDO account with this email already exists.",
      });
    }
    throw error;
  }

  if (registrationError) throw registrationError;
  if (!userId) throw new AppError("We couldn't finish creating your account. Please try again.");
  await startSession(userId);
  return { mustChangePassword: false };
}

export async function hrdoLogout(): Promise<{ ok: true }> {
  const token = getCookie(sessionCookieName());
  if (token) await run("DELETE FROM hrdo_sessions WHERE token_hash = ?", [sha256(token)]);
  clearSessionCookie();
  return { ok: true };
}

export async function hrdoChangePassword(input: unknown): Promise<{ ok: true }> {
  const current = await requireHrdoViewer();
  const data = parseInput(changePasswordSchema, input);

  const rows = await all<HrdoUserRow[]>(
    "SELECT password_hash FROM hrdo_users WHERE id = ? LIMIT 1",
    [current.id],
  );
  const stored = rows[0]?.password_hash;
  if (!stored || !(await verifyPassword(data.currentPassword, stored))) {
    throw new AppError("Your current password is incorrect.", {
      currentPassword: "Your current password is incorrect.",
    });
  }
  if (data.newPassword === data.currentPassword) {
    throw new AppError("Choose a password you have not used here before.", {
      newPassword: "Choose a password different from your current one.",
    });
  }

  const token = getCookie(sessionCookieName());
  const passwordHash = await hashPassword(data.newPassword);
  await withTransaction(async (conn) => {
    await run(
      "UPDATE hrdo_users SET password_hash = ?, must_change_password = 0, failed_attempts = 0, locked_until = NULL WHERE id = ?",
      [passwordHash, current.id],
      conn,
    );
    if (current.role === "employee") {
      await run(
        "UPDATE users SET password_hash = ?, must_change_password = 0, failed_attempts = 0, locked_until = NULL WHERE email = ? AND role = 'requisitioner'",
        [passwordHash, current.email],
        conn,
      );
      await run(
        "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ? AND role = 'requisitioner')",
        [current.email],
        conn,
      );
    }
  });
  if (token) {
    await run("DELETE FROM hrdo_sessions WHERE user_id = ? AND token_hash <> ?", [
      current.id,
      sha256(token),
    ]);
  }
  return { ok: true };
}

export async function hrdoUpdateProfile(input: unknown): Promise<HrdoViewer> {
  const current = await requireHrdoViewer();
  const data = parseInput(profileSchema, input);
  await withTransaction(async (conn) => {
    await run(
      "UPDATE hrdo_users SET name = ?, department = ? WHERE id = ?",
      [data.name, data.department, current.id],
      conn,
    );
    if (current.role === "employee") {
      await run(
        "UPDATE users SET name = ?, department = ? WHERE email = ? AND role = 'requisitioner'",
        [data.name, data.department, current.email],
        conn,
      );
    }
  });
  return { ...current, name: data.name, department: data.department };
}

/** Saves the split name collected from first-time HRDO Google sign-ins. */
export async function hrdoCompleteProfileName(input: unknown): Promise<HrdoViewer> {
  const current = await requireHrdoViewer();
  const data = parseInput(namePartsSchema, input);
  const name = joinFullName(data);
  if (name.length < 2) throw new AppError("Enter your full name.");
  if (name.length > 120) throw new AppError("Names must be 120 characters or fewer.");

  await withTransaction(async (conn) => {
    await run("UPDATE hrdo_users SET name = ? WHERE id = ?", [name, current.id], conn);
    if (current.role === "employee") {
      await run(
        "UPDATE users SET name = ? WHERE email = ? AND role = 'requisitioner'",
        [name, current.email],
        conn,
      );
    }
  });
  return { ...current, name };
}
