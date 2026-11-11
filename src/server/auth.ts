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
import type { Role, Viewer } from "@/lib/types";
import {
  changePasswordSchema,
  institutionalEmailAllowed,
  loginSchema,
  normaliseEmail,
  passwordIssues,
  profileSchema,
  registrationOtpSchema,
  passwordRecoveryRequestSchema,
  passwordRecoverySchema,
  registerSchema,
} from "@/lib/validation";
import { encryptedCookieRequired, serverEnv, serverEnvOptional } from "./env";
import { all, run, withTransaction } from "./db";
import { AppError, isDuplicateKey, parseInput } from "@/lib/errors";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password";
import { sendRegistrationOtpEmail } from "./gmail";

export const SESSION_COOKIE_NAME = "loa_session";

function sessionCookieName() {
  return SESSION_COOKIE_NAME;
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

interface UserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  department: string;
  must_change_password: number;
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

function mapViewer(row: UserRow): Viewer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department,
    mustChangePassword: Boolean(row.must_change_password),
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

/** Creates a database session and returns the raw token for the response cookie. */
export async function createSession(userId: string): Promise<{ token: string; maxAge: number }> {
  const cookieName = sessionCookieName();
  const previous = getCookie(cookieName);
  if (previous) {
    await run("DELETE FROM sessions WHERE token_hash = ?", [sha256(previous)]);
  }

  const token = randomBytes(32).toString("base64url");
  const userAgent = (getRequestHeader("user-agent") ?? "").slice(0, 255);
  await run(
    `INSERT INTO sessions (id, user_id, token_hash, user_agent, expires_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [randomUUID(), userId, sha256(token), userAgent, sessionHours()],
  );
  await run("DELETE FROM sessions WHERE expires_at < DATE_SUB(NOW(), INTERVAL 7 DAY)");
  return { token, maxAge: sessionSeconds() };
}

async function startSession(userId: string) {
  const { token, maxAge } = await createSession(userId);
  setCookie(sessionCookieName(), token, cookieOptions(maxAge));
}

export interface GoogleSignInAccount {
  id: string;
  role: Role;
  mustChangePassword: boolean;
}

/** Looks up an account for Google sign-in without starting a session. */
export async function googleSignInAccount(email: string): Promise<GoogleSignInAccount | null> {
  const rows = await all<UserRow[]>(
    "SELECT id, role, must_change_password FROM users WHERE email = ? LIMIT 1",
    [normaliseEmail(email)],
  );
  const row = rows[0];
  return row
    ? { id: row.id, role: row.role, mustChangePassword: Boolean(row.must_change_password) }
    : null;
}

export async function ensureGoogleRequisitionerAccount(
  email: string,
): Promise<GoogleSignInAccount> {
  const normalised = normaliseEmail(email);
  const existing = await googleSignInAccount(normalised);
  if (existing) return existing;

  if (!institutionalEmailAllowed(normalised)) {
    throw new AppError("Use your official Lyceum of Alabang email address.");
  }

  const localName = normalised
    .split("@")[0]
    ?.replace(/[._-]+/g, " ")
    .trim();
  const name = localName || "Institutional User";
  const id = randomUUID();
  await run(
    `INSERT INTO users (id, name, email, password_hash, role, department, must_change_password)
     VALUES (?, ?, ?, ?, 'requisitioner', 'General', 1)`,
    [id, name, normalised, DUMMY_HASH],
  );

  return { id, role: "requisitioner", mustChangePassword: true };
}

function clearSessionCookie() {
  deleteCookie(sessionCookieName(), { path: "/" });
}

export async function viewer(): Promise<Viewer | null> {
  const cookieName = sessionCookieName();
  const token = getCookie(cookieName);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    if (token) clearSessionCookie();
    return null;
  }
  const hash = sha256(token);
  const rows = await all<UserRow[]>(
    `SELECT u.id, u.name, u.email, u.role, u.department, u.must_change_password
     FROM sessions s
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
    `UPDATE sessions
     SET last_seen_at = NOW(),
         expires_at = IF(expires_at < DATE_ADD(NOW(), INTERVAL 2 HOUR), DATE_ADD(NOW(), INTERVAL ? HOUR), expires_at)
     WHERE token_hash = ?
       AND last_seen_at < DATE_SUB(NOW(), INTERVAL 1 MINUTE)`,
    [sessionHours(), hash],
  );
  setCookie(cookieName, token, cookieOptions(sessionSeconds()));
  return mapViewer(row);
}

export async function requireViewer(): Promise<Viewer> {
  const current = await viewer();
  if (!current) throw new AppError("Please sign in to continue.");
  return current;
}

export async function login(input: unknown): Promise<{ mustChangePassword: boolean }> {
  const data = parseInput(loginSchema, input);
  const email = normaliseEmail(data.email);

  checkIpRateLimit(getRequestIP() ?? "unknown");

  const rows = await all<UserRow[]>(
    `SELECT id, name, email, password_hash, role, department, must_change_password,
            (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked,
            TIMESTAMPDIFF(MINUTE, NOW(), locked_until) AS lock_minutes
     FROM users WHERE email = ? LIMIT 1`,
    [email],
  );
  const invalid = new AppError("Incorrect email or password.");

  let user = rows[0];
  if (!user) {
    const employeeRows = await all<
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
       FROM hrdo_users WHERE email = ? AND role = 'employee' LIMIT 1`,
      [email],
    );
    const employee = employeeRows[0];
    if (!employee) {
      await verifyPassword(data.password, DUMMY_HASH);
      throw invalid;
    }

    if (employee.is_locked) {
      const minutes = Math.max(1, Number(employee.lock_minutes ?? LOCK_MINUTES));
      throw new AppError(
        `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      );
    }

    if (!(await verifyPassword(data.password, employee.password_hash))) {
      await run(
        `UPDATE hrdo_users SET failed_attempts = failed_attempts + 1,
          locked_until = IF(failed_attempts + 1 >= ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), locked_until)
         WHERE id = ?`,
        [MAX_FAILED_ATTEMPTS, LOCK_MINUTES, employee.id],
      );
      throw invalid;
    }

    await run(
      `INSERT INTO users (id, name, email, password_hash, role, department, must_change_password)
       VALUES (?, ?, ?, ?, 'requisitioner', ?, ?)`,
      [
        employee.id,
        employee.name,
        employee.email,
        employee.password_hash,
        employee.department,
        employee.must_change_password,
      ],
    );
    const linkedRows = await all<UserRow[]>(
      `SELECT id, name, email, password_hash, role, department, must_change_password,
              0 AS is_locked, NULL AS lock_minutes
       FROM users WHERE id = ? LIMIT 1`,
      [employee.id],
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
    if (user.role === "requisitioner") {
      const employeeRows = await all<Array<RowDataPacket & { password_hash: string }>>(
        "SELECT password_hash FROM hrdo_users WHERE email = ? AND role = 'employee' LIMIT 1",
        [email],
      );
      const employee = employeeRows[0];
      if (employee && (await verifyPassword(data.password, employee.password_hash))) {
        await withTransaction(async (conn) => {
          await run(
            "UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?",
            [employee.password_hash, user.id],
            conn,
          );
          await run(
            "UPDATE hrdo_users SET failed_attempts = 0, locked_until = NULL WHERE email = ? AND role = 'employee'",
            [email],
            conn,
          );
        });
        await startSession(user.id);
        return { mustChangePassword: Boolean(user.must_change_password) };
      }
    }

    await run(
      `UPDATE users SET failed_attempts = failed_attempts + 1,
        locked_until = IF(failed_attempts + 1 >= ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), locked_until)
       WHERE id = ?`,
      [MAX_FAILED_ATTEMPTS, LOCK_MINUTES, user.id],
    );
    throw invalid;
  }

  await run("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?", [user.id]);
  await startSession(user.id);
  return { mustChangePassword: Boolean(user.must_change_password) };
}

export async function requestPasswordRecovery(input: unknown): Promise<{ sent: true }> {
  const { email } = parseInput(passwordRecoveryRequestSchema, input);
  const rows = await all<UserRow[]>(
    "SELECT id, name, email, password_hash, role, department, must_change_password FROM users WHERE email = ? LIMIT 1",
    [normaliseEmail(email)],
  );
  const user = rows[0];
  if (!user) return { sent: true };

  const code = String(randomInt(100000, 1000000));
  const codeHash = sha256(code);
  await run(
    `INSERT INTO registration_otps
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
      codeHash,
      randomUUID(),
      PASSWORD_RECOVERY_MINUTES,
      PASSWORD_RECOVERY_MINUTES,
    ],
  );
  await sendRegistrationOtpEmail(user.email, user.name, code, PASSWORD_RECOVERY_MINUTES);
  return { sent: true };
}

export async function resetPasswordWithRecoveryCode(input: unknown): Promise<{ reset: true }> {
  const data = parseInput(passwordRecoverySchema, input);
  const email = normaliseEmail(data.email);
  const userRows = await all<UserRow[]>("SELECT id, role FROM users WHERE email = ? LIMIT 1", [
    email,
  ]);
  const user = userRows[0];
  if (!user) throw new AppError("The recovery code is invalid or expired.");
  const otpRows = await all<
    Array<RowDataPacket & { code_hash: string; expires_at: string; attempts: number }>
  >(
    "SELECT code_hash, expires_at, attempts FROM registration_otps WHERE email = ? LIMIT 1",
    [email],
  );
  const otp = otpRows[0];
  if (
    !otp ||
    otp.expires_at <= new Date().toISOString().slice(0, 19).replace("T", " ") ||
    otp.attempts >= REGISTRATION_OTP_MAX_ATTEMPTS
  ) {
    throw new AppError("The recovery code is invalid or expired.");
  }
  if (otp.code_hash !== sha256(data.code)) {
    await run("UPDATE registration_otps SET attempts = attempts + 1 WHERE email = ?", [email]);
    throw new AppError("The recovery code is invalid or expired.");
  }
  const passwordHash = await hashPassword(data.newPassword);
  await withTransaction(async (conn) => {
    await run(
      "UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, must_change_password = 0 WHERE id = ?",
      [passwordHash, user.id],
      conn,
    );
    if (user.role === "requisitioner") {
      await run(
        "UPDATE hrdo_users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, must_change_password = 0 WHERE email = ? AND role = 'employee'",
        [passwordHash, email],
        conn,
      );
      await run("DELETE FROM sessions WHERE user_id = ?", [user.id], conn);
      await run(
        "DELETE FROM hrdo_sessions WHERE user_id IN (SELECT id FROM hrdo_users WHERE email = ? AND role = 'employee')",
        [email],
        conn,
      );
    } else {
      await run("DELETE FROM sessions WHERE user_id = ?", [user.id], conn);
    }
    await run("DELETE FROM registration_otps WHERE email = ?", [email], conn);
  });
  return { reset: true };
}

interface RegistrationOtpRow extends RowDataPacket {
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

export async function requestRegistrationOtp(input: unknown): Promise<{ sent: true }> {
  const data = parseInput(registerSchema, input);
  const email = normaliseEmail(data.email);

  if (
    !serverEnvOptional("GOOGLE_CLIENT_ID") ||
    !serverEnvOptional("GOOGLE_CLIENT_SECRET") ||
    !serverEnvOptional("GOOGLE_REFRESH_TOKEN") ||
    !serverEnvOptional("GOOGLE_SENDER_EMAIL")
  ) {
    throw new AppError(
      "Email verification is not connected yet. Please contact the system administrator.",
    );
  }

  if (!institutionalEmailAllowed(email)) {
    throw new AppError("Use your official Lyceum of Alabang email address.", {
      email: "Use your official @lyceumalabang.edu.ph email address.",
    });
  }

  const passwordProblem = passwordIssues(data.password)[0];
  if (passwordProblem) throw new AppError(`Password needs ${passwordProblem}.`);

  const existing = await all<RowDataPacket[]>("SELECT id FROM users WHERE email = ? LIMIT 1", [
    email,
  ]);
  if (existing.length) {
    throw new AppError("An account with this email already exists. Sign in instead.", {
      email: "An account with this email already exists.",
    });
  }

  const passwordHash = await hashPassword(data.password);
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const codeHash = registrationOtpHash(email, code);
  const sendNonce = randomUUID();

  await withTransaction(async (conn) => {
    await run(
      `INSERT INTO registration_otps
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
    const pending = await all<RegistrationOtpRow[]>(
      `SELECT send_nonce, TIMESTAMPDIFF(SECOND, last_sent_at, NOW()) AS seconds_since_sent
         FROM registration_otps WHERE email = ?`,
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
    await run("DELETE FROM registration_otps WHERE email = ? AND code_hash = ?", [email, codeHash]);
    throw error;
  }
  return { sent: true };
}

export async function verifyRegistrationOtp(
  input: unknown,
): Promise<{ mustChangePassword: boolean }> {
  const data = parseInput(registrationOtpSchema, input);
  const email = normaliseEmail(data.email);
  const candidateHash = registrationOtpHash(email, data.code);

  let registrationError: AppError | undefined;
  let userId: string | undefined;
  try {
    const outcome = await withTransaction(async (conn) => {
      const rows = await all<RegistrationOtpRow[]>(
        `SELECT name, department, password_hash, code_hash, attempts,
                TIMESTAMPDIFF(SECOND, last_sent_at, NOW()) AS seconds_since_sent,
                (expires_at <= NOW()) AS expired
         FROM registration_otps WHERE email = ? FOR UPDATE`,
        [email],
        conn,
      );
      const pending = rows[0];
      if (!pending) {
        return new AppError("That verification code is no longer valid. Request a new code.");
      }
      if (pending.expired) {
        await run("DELETE FROM registration_otps WHERE email = ?", [email], conn);
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
          await run("DELETE FROM registration_otps WHERE email = ?", [email], conn);
          return new AppError("Too many incorrect codes. Request a new verification code.");
        }
        await run(
          "UPDATE registration_otps SET attempts = ? WHERE email = ?",
          [attempts, email],
          conn,
        );
        return new AppError(
          `That code is incorrect. ${REGISTRATION_OTP_MAX_ATTEMPTS - attempts} attempts remaining.`,
          { code: "Check the code and try again." },
        );
      }

      const existing = await all<RowDataPacket[]>(
        "SELECT id FROM users WHERE email = ? LIMIT 1",
        [email],
        conn,
      );
      if (existing.length) {
        await run("DELETE FROM registration_otps WHERE email = ?", [email], conn);
        return new AppError("An account with this email already exists. Sign in instead.", {
          email: "An account with this email already exists.",
        });
      }

      const hrdoAccounts = await all<
        Array<RowDataPacket & { id: string; role: "employee" | "hrdo_staff" | "hrdo_admin" }>
      >("SELECT id, role FROM hrdo_users WHERE email = ? LIMIT 1 FOR UPDATE", [email], conn);
      const hrdoAccount = hrdoAccounts[0];
      if (hrdoAccount?.role === "hrdo_staff" || hrdoAccount?.role === "hrdo_admin") {
        await run("DELETE FROM registration_otps WHERE email = ?", [email], conn);
        return new AppError(
          "This email already has an HRDO staff account. Contact an administrator to link modules.",
          { email: "This email is already assigned to an HRDO staff account." },
        );
      }

      userId = randomUUID();
      await run(
        `INSERT INTO users (id, name, email, password_hash, role, department, must_change_password)
         VALUES (?, ?, ?, ?, 'requisitioner', ?, 0)`,
        [userId, pending.name, email, pending.password_hash, pending.department || "General"],
        conn,
      );
      if (hrdoAccount) {
        await run(
          `UPDATE hrdo_users
           SET name = ?, department = ?, password_hash = ?, must_change_password = 0,
               failed_attempts = 0, locked_until = NULL
           WHERE id = ?`,
          [pending.name, pending.department, pending.password_hash, hrdoAccount.id],
          conn,
        );
      } else {
        await run(
          `INSERT INTO hrdo_users
            (id, name, email, password_hash, role, department, must_change_password)
           VALUES (?, ?, ?, ?, 'employee', ?, 0)`,
          [userId, pending.name, email, pending.password_hash, pending.department],
          conn,
        );
      }
      await run("DELETE FROM registration_otps WHERE email = ?", [email], conn);
      return null;
    });
    registrationError = outcome ?? undefined;
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError("An account with this email already exists. Sign in instead.", {
        email: "An account with this email already exists.",
      });
    }
    throw error;
  }

  if (registrationError) throw registrationError;
  if (!userId) throw new AppError("We couldn't finish creating your account. Please try again.");
  await startSession(userId);
  return { mustChangePassword: false };
}

export async function logout(): Promise<{ ok: true }> {
  const token = getCookie(sessionCookieName());
  if (token) await run("DELETE FROM sessions WHERE token_hash = ?", [sha256(token)]);
  clearSessionCookie();
  return { ok: true };
}

export async function changePassword(input: unknown): Promise<{ ok: true }> {
  const current = await requireViewer();
  const data = parseInput(changePasswordSchema, input);

  const rows = await all<UserRow[]>("SELECT password_hash FROM users WHERE id = ? LIMIT 1", [
    current.id,
  ]);
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
      "UPDATE users SET password_hash = ?, must_change_password = 0, failed_attempts = 0, locked_until = NULL WHERE id = ?",
      [passwordHash, current.id],
      conn,
    );
    if (current.role === "requisitioner") {
      await run(
        "UPDATE hrdo_users SET password_hash = ?, must_change_password = 0, failed_attempts = 0, locked_until = NULL WHERE email = ? AND role = 'employee'",
        [passwordHash, current.email],
        conn,
      );
      await run(
        "DELETE FROM hrdo_sessions WHERE user_id IN (SELECT id FROM hrdo_users WHERE email = ? AND role = 'employee')",
        [current.email],
        conn,
      );
    }
  });
  if (token) {
    await run("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", [
      current.id,
      sha256(token),
    ]);
  }
  return { ok: true };
}

export async function updateProfile(input: unknown): Promise<Viewer> {
  const current = await requireViewer();
  const data = parseInput(profileSchema, input);
  await withTransaction(async (conn) => {
    await run(
      "UPDATE users SET name = ?, department = ? WHERE id = ?",
      [data.name, data.department, current.id],
      conn,
    );
    if (current.role === "requisitioner") {
      await run(
        "UPDATE hrdo_users SET name = ?, department = ? WHERE email = ? AND role = 'employee'",
        [data.name, data.department, current.email],
        conn,
      );
    }
  });
  return { ...current, name: data.name, department: data.department };
}
