import { randomBytes, randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { createHrdoProcessorAccountSchema } from "@/lib/validation";
import { AppError, isDuplicateKey, parseInput } from "@/lib/errors";
import { viewer } from "@/server/auth";
import { hrdoViewer } from "@/server/hrdo/auth";
import { all, run } from "@/server/db";
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
  if (mainViewer?.role === "admin") return { canCreateHrdoAdmin: true };
  const hrdoUser = await hrdoViewer();
  if (canManageHrdoAccounts(hrdoUser)) return { canCreateHrdoAdmin: false };
  throw new AppError("Only administrators can manage HRDO processor accounts.");
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
