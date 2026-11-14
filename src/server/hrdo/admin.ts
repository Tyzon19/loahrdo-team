import { randomBytes, randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { createHrdoProcessorAccountSchema, resetUserPasswordSchema } from "@/lib/validation";
import { AppError, isDuplicateKey, parseInput } from "@/lib/errors";
import { viewer } from "@/server/auth";
import { hrdoViewer } from "@/server/hrdo/auth";
import { all, run, withTransaction } from "@/server/db";
import { hashPassword } from "@/server/password";
import { sendTemporaryPasswordEmail } from "@/server/gmail";
import { canManageHrdoAccounts, type HrdoRole } from "@/lib/hrdo";

interface HrdoProcessorRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  department: string;
  role: HrdoRole;
  must_change_password: number;
}

async function requireAccountManager() {
  const mainViewer = await viewer();
  if (mainViewer?.isSuperAdmin) return { canCreateHrdoAdmin: true };
  const hrdoUser = await hrdoViewer();
  if (canManageHrdoAccounts(hrdoUser)) {
    return { canCreateHrdoAdmin: Boolean(hrdoUser?.isSuperAdmin) };
  }
  throw new AppError("Only administrators can manage HRDO processor accounts.");
}

async function requireSuperAdmin() {
  const mainViewer = await viewer();
  if (!mainViewer?.isSuperAdmin) {
    throw new AppError("Only Super Admins can reset COE processor passwords.");
  }
}

function createTemporaryPassword() {
  return `${randomBytes(24).toString("base64url")}Aa1!`;
}

export async function listHrdoProcessorAccounts() {
  await requireAccountManager();
  const rows = await all<HrdoProcessorRow[]>(
    `SELECT id, name, email, department, role, must_change_password
     FROM hrdo_users
     WHERE role <> 'employee'
     ORDER BY name ASC, email ASC`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department,
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password),
  }));
}

export async function createHrdoProcessorAccount(input: unknown) {
  const manager = await requireAccountManager();
  const data = parseInput(createHrdoProcessorAccountSchema, input);
  if (data.isHrdoAdmin && !manager.canCreateHrdoAdmin) {
    throw new AppError("Only the main system administrator can create an HRDO administrator.");
  }
  const role: Extract<HrdoRole, "hrdo_admin" | "hrdo_staff"> = data.isHrdoAdmin
    ? "hrdo_admin"
    : "hrdo_staff";
  const id = randomUUID();
  const temporaryPassword = `${randomBytes(24).toString("base64url")}Aa1!`;
  try {
    await run(
      `INSERT INTO hrdo_users
        (id, name, email, password_hash, role, department, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [id, data.name, data.email, await hashPassword(temporaryPassword), role, data.department],
    );
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError("An HRDO account with this email already exists.");
    }
    throw error;
  }

  const emailDelivery = await sendTemporaryPasswordEmail({
    recipientName: data.name,
    recipientEmail: data.email,
    temporaryPassword,
    signatoryTitle: role === "hrdo_admin" ? "HRDO Administrator" : "HRDO COE Processor",
    loginPath: "/hrdo/login",
    systemName: "LOA HRDO Certificate of Employment",
  });
  return {
    id,
    name: data.name,
    email: data.email,
    role,
    emailDelivery,
    ...(!emailDelivery.sent ? { temporaryPassword } : {}),
  };
}

export async function resetHrdoProcessorPassword(input: unknown) {
  await requireSuperAdmin();
  const { userId } = parseInput(resetUserPasswordSchema, input);
  const temporaryPassword = createTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const user = await withTransaction(async (conn) => {
    const users = await all<HrdoProcessorRow[]>(
      `SELECT id, name, email, department, role, must_change_password
       FROM hrdo_users
       WHERE id = ? AND role <> 'employee'
       LIMIT 1
       FOR UPDATE`,
      [userId],
      conn,
    );
    const account = users[0];
    if (!account) throw new AppError("Choose a valid COE processor account.");
    await run(
      `UPDATE hrdo_users
       SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL
       WHERE id = ? AND role <> 'employee'`,
      [passwordHash, userId],
      conn,
    );
    await run("DELETE FROM hrdo_sessions WHERE user_id = ?", [userId], conn);
    return account;
  });

  const emailDelivery = await sendTemporaryPasswordEmail({
    recipientName: user.name,
    recipientEmail: user.email,
    temporaryPassword,
    signatoryTitle: user.role === "hrdo_admin" ? "HRDO Administrator" : "COE Processor",
    accountAction: "password-reset",
    loginPath: "/hrdo/login",
    systemName: "LOA HRDO Certificate of Employment",
  });
  return {
    email: user.email,
    emailDelivery,
    ...(!emailDelivery.sent ? { temporaryPassword } : {}),
  };
}
