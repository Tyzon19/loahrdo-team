import { randomBytes, randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { AppError, isDuplicateKey, parseInput } from "@/lib/errors";
import {
  approvePermissionSchema,
  createPermissionSignatorySchema,
  createPermissionSchema,
  permissionIdSchema,
  permissionSignatoryIdSchema,
  rejectPermissionSchema,
  sendPermissionReceiptSchema,
} from "@/lib/permission-schema";
import { emailDomainAllowed, INSTITUTIONAL_EMAIL_DOMAIN } from "@/lib/validation";
import {
  canManagePermissionSignatories,
  canViewPermissionQueue,
  isPermissionHead,
  type PermissionViewer,
} from "@/lib/permission-access";
import { canAccessAdminPortal } from "@/lib/access";
import { all, run, withTransaction } from "../db";
import { requirePermissionViewer } from "./auth";
import { requireViewer, viewer } from "../auth";
import { hashPassword } from "../password";
import { sendPermissionSlipEmail, sendTemporaryPasswordEmail } from "../gmail";

export const PERMISSION_HEAD_DEPARTMENT = "Human Resources Development Office";

export type PermissionStatus = "pending_approval" | "approved" | "rejected";

export interface PermissionSlip {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  department: string;
  requestedDate: string;
  timeOut: string;
  timeIn: string;
  reason: string;
  employeeSignature: string;
  status: PermissionStatus;
  departmentHeadId?: string;
  departmentHeadName?: string;
  departmentHeadSignature?: string;
  rejectionReason?: string;
  requestedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  history: PermissionHistoryEntry[];
}

export interface PermissionHistoryEntry {
  id: string;
  actorId?: string;
  actorName: string;
  actorRole: "requisitioner" | "department_head" | "system";
  type: "submitted" | "approved" | "rejected";
  message: string;
  happenedAt: string;
}

interface PermissionRow extends RowDataPacket {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  department: string;
  requested_date: string;
  time_out: string;
  time_in: string;
  reason: string;
  employee_signature: string;
  status: PermissionStatus;
  department_head_id: string | null;
  department_head_name: string | null;
  department_head_signature: string | null;
  rejection_reason: string | null;
  requested_at: string;
  approved_at: string | null;
  rejected_at: string | null;
}

interface PermissionHistoryRow extends RowDataPacket {
  id: string;
  permission_slip_id: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: PermissionHistoryEntry["actorRole"];
  type: PermissionHistoryEntry["type"];
  message: string;
  happened_at: string;
}

interface HeadRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
}

interface PermissionSignatoryRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  department: string;
  must_change_password: number;
}

interface PermissionSignatoryIdRow extends RowDataPacket {
  user_id: string;
}

interface PermissionSignatoryCandidateRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  is_super_admin: number;
}

function createTemporaryPassword() {
  return `${randomBytes(12).toString("base64url")}Aa1!`;
}

async function requirePermissionSignatoryManager() {
  const current = await requireViewer();
  if (!canManagePermissionSignatories(current)) {
    throw new AppError("Only Super Admins can manage Permission Slip signatories.");
  }
  return current;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function mapPermission(row: PermissionRow, history: PermissionHistoryRow[]): PermissionSlip {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employeeEmail: row.employee_email,
    department: row.department,
    requestedDate: row.requested_date,
    timeOut: row.time_out,
    timeIn: row.time_in,
    reason: row.reason,
    employeeSignature: row.employee_signature,
    status: row.status,
    ...(row.department_head_id ? { departmentHeadId: row.department_head_id } : {}),
    ...(row.department_head_name ? { departmentHeadName: row.department_head_name } : {}),
    ...(row.department_head_signature
      ? { departmentHeadSignature: row.department_head_signature }
      : {}),
    ...(row.rejection_reason ? { rejectionReason: row.rejection_reason } : {}),
    requestedAt: row.requested_at,
    ...(row.approved_at ? { approvedAt: row.approved_at } : {}),
    ...(row.rejected_at ? { rejectedAt: row.rejected_at } : {}),
    history: history.map((item) => ({
      id: item.id,
      ...(item.actor_id ? { actorId: item.actor_id } : {}),
      actorName: item.actor_name,
      actorRole: item.actor_role,
      type: item.type,
      message: item.message,
      happenedAt: item.happened_at,
    })),
  };
}

async function loadPermission(id: string) {
  const rows = await all<PermissionRow[]>("SELECT * FROM permission_slips WHERE id = ? LIMIT 1", [
    id,
  ]);
  const row = rows[0];
  if (!row) return null;
  const items = await loadPermissions(rows);
  return items[0] ?? null;
}

async function loadPermissions(rows: PermissionRow[]) {
  if (!rows.length) return [];

  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(", ");
  const historyRows = await all<PermissionHistoryRow[]>(
    `SELECT * FROM permission_history
     WHERE permission_slip_id IN (${placeholders})
     ORDER BY happened_at, id`,
    ids,
  );
  const historyBySlip = new Map<string, PermissionHistoryRow[]>();
  for (const history of historyRows) {
    const entries = historyBySlip.get(history.permission_slip_id) ?? [];
    entries.push(history);
    historyBySlip.set(history.permission_slip_id, entries);
  }

  return rows.map((row) => mapPermission(row, historyBySlip.get(row.id) ?? []));
}

function canView(viewer: PermissionViewer, slip: PermissionSlip) {
  return canViewPermissionQueue(viewer) || viewer.id === slip.employeeId;
}

function requireDepartmentHead(viewer: PermissionViewer) {
  if (!isPermissionHead(viewer)) {
    throw new AppError("Only an assigned Permission Slip signatory can approve or reject slips.");
  }
}

async function requireReceiptArchiver() {
  const mainViewer = await viewer();
  if (mainViewer && canAccessAdminPortal(mainViewer.role, mainViewer.isSuperAdmin)) {
    return;
  }
  const permissionViewer = await requirePermissionViewer();
  requireDepartmentHead(permissionViewer);
}

export async function listPermissionSignatories() {
  await requirePermissionSignatoryManager();
  const rows = await all<PermissionSignatoryRow[]>(
    `SELECT u.id, u.name, u.email, u.department, u.must_change_password
     FROM permission_slip_signatories p
     JOIN users u ON u.id = p.user_id
     ORDER BY u.name ASC, u.email ASC`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department,
    mustChangePassword: Boolean(row.must_change_password),
  }));
}

export async function listPermissionSignatoryCandidates() {
  await requirePermissionSignatoryManager();
  const rows = await all<PermissionSignatoryCandidateRow[]>(
    `SELECT u.id, u.name, u.email, u.department, u.role, u.is_super_admin
     FROM users u
     WHERE u.role <> 'admin'
       AND u.is_super_admin = 0
       AND LOWER(SUBSTRING_INDEX(u.email, '@', -1)) = ?
       AND NOT EXISTS (
         SELECT 1 FROM permission_slip_signatories p WHERE p.user_id = u.id
       )
     ORDER BY u.name ASC, u.email ASC`,
    [INSTITUTIONAL_EMAIL_DOMAIN],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department,
  }));
}

export async function assignPermissionSignatory(input: unknown) {
  const actor = await requirePermissionSignatoryManager();
  const userId = parseInput(permissionSignatoryIdSchema, input);
  const user = await withTransaction(async (conn) => {
    const rows = await all<PermissionSignatoryCandidateRow[]>(
      `SELECT id, name, email, department, role, is_super_admin
       FROM users
       WHERE id = ? AND role <> 'admin' AND is_super_admin = 0
       LIMIT 1
       FOR UPDATE`,
      [userId],
      conn,
    );
    const account = rows[0];
    if (!account) throw new AppError("Choose an eligible institutional account.");
    if (!emailDomainAllowed(account.email, [INSTITUTIONAL_EMAIL_DOMAIN])) {
      throw new AppError("Permission Slip signatories must use an @lyceumalabang.edu.ph account.");
    }
    await run(
      "INSERT INTO permission_slip_signatories (user_id, assigned_by) VALUES (?, ?)",
      [userId, actor.id],
      conn,
    );
    return account;
  }).catch((error: unknown) => {
    if (isDuplicateKey(error)) {
      throw new AppError("That account is already a Permission Slip signatory.");
    }
    throw error;
  });
  return { id: user.id, name: user.name, email: user.email };
}

export async function createPermissionSignatory(input: unknown) {
  const actor = await requirePermissionSignatoryManager();
  const data = parseInput(createPermissionSignatorySchema, input);
  const id = randomUUID();
  const temporaryPassword = createTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  try {
    await withTransaction(async (conn) => {
      await run(
        `INSERT INTO users
          (id, name, email, password_hash, role, department, must_change_password)
         VALUES (?, ?, ?, ?, 'requisitioner', ?, 1)`,
        [id, data.name, data.email, passwordHash, data.department],
        conn,
      );
      await run(
        "INSERT INTO permission_slip_signatories (user_id, assigned_by) VALUES (?, ?)",
        [id, actor.id],
        conn,
      );
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError(
        "This email already has an account. Assign it from the existing accounts list.",
      );
    }
    throw error;
  }

  const emailDelivery = await sendTemporaryPasswordEmail({
    recipientName: data.name,
    recipientEmail: data.email,
    temporaryPassword,
    signatoryTitle: "Permission Slip Signatory",
    loginPath: "/permission-slips/login",
    systemName: "LOA Permission Slip",
  });
  return {
    id,
    name: data.name,
    email: data.email,
    emailDelivery,
    ...(!emailDelivery.sent ? { temporaryPassword } : {}),
  };
}

export async function removePermissionSignatory(input: unknown) {
  await requirePermissionSignatoryManager();
  const userId = parseInput(permissionSignatoryIdSchema, input);
  await withTransaction(async (conn) => {
    const signatories = await all<PermissionSignatoryIdRow[]>(
      "SELECT user_id FROM permission_slip_signatories FOR UPDATE",
      [],
      conn,
    );
    if (!signatories.some((row) => row.user_id === userId)) {
      throw new AppError("That account is not an active Permission Slip signatory.");
    }
    if (signatories.length <= 1) {
      throw new AppError("At least one Permission Slip signatory must remain assigned.");
    }
    await run("DELETE FROM permission_slip_signatories WHERE user_id = ?", [userId], conn);
    await run("DELETE FROM permission_sessions WHERE user_id = ?", [userId], conn);
  });
  return { ok: true as const };
}

export async function submitPermissionSlip(input: unknown) {
  const viewer = await requirePermissionViewer();
  if (viewer.role !== "employee") {
    throw new AppError("Only employees can submit permission slips.");
  }
  const data = parseInput(createPermissionSchema, input);
  const today = new Date().toISOString().slice(0, 10);
  if (data.requestedDate < today) {
    throw new AppError("The Permission Slip date cannot be in the past.", {
      requestedDate: "Choose today or a future date.",
    });
  }
  if (timeToMinutes(data.timeIn) <= timeToMinutes(data.timeOut)) {
    throw new AppError("Time In must be later than Time Out.", {
      timeIn: "Time In must be later than Time Out.",
    });
  }

  const signatories = await all<HeadRow[]>(
    `SELECT u.id, u.name, u.email
     FROM permission_slip_signatories p
     JOIN users u ON u.id = p.user_id
     ORDER BY u.name ASC, u.email ASC`,
  );
  if (!signatories.length) {
    throw new AppError("No Permission Slip signatories are configured.");
  }

  const id = randomUUID();
  await run(
    `INSERT INTO permission_slips
      (id, employee_id, employee_name, employee_email, department, requested_date,
       time_out, time_in, reason, employee_signature, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval')`,
    [
      id,
      viewer.id,
      viewer.name,
      viewer.email,
      data.department,
      data.requestedDate,
      data.timeOut,
      data.timeIn,
      data.reason,
      data.employeeSignature,
    ],
  );
  await run(
    `INSERT INTO permission_history
      (id, permission_slip_id, actor_id, actor_name, actor_role, type, message)
     VALUES (?, ?, ?, ?, 'requisitioner', 'submitted', ?)`,
    [randomUUID(), id, viewer.id, viewer.name, "Permission slip submitted for HRDO approval."],
  );

  const deliveries = await Promise.all(
    signatories.map((signatory) =>
      sendPermissionSlipEmail({
        kind: "head_review",
        recipientName: signatory.name,
        recipientEmail: signatory.email,
        permissionId: id,
        employeeName: viewer.name,
        department: data.department,
        requestedDate: data.requestedDate,
        timeOut: data.timeOut,
        timeIn: data.timeIn,
        reason: data.reason,
      }),
    ),
  );
  const delivered = deliveries.reduce((total, result) => total + result.delivered, 0);
  const failed = deliveries.reduce((total, result) => total + result.failed, 0);
  const emailDelivery =
    failed > 0
      ? {
          sent: false as const,
          delivered,
          failed,
          message: `The Permission Slip was saved, but email delivery failed for ${failed} signatory recipient(s).`,
        }
      : { sent: true as const, delivered, failed: 0 as const };
  return { id, emailDelivery };
}

export async function listMyPermissionSlips() {
  const viewer = await requirePermissionViewer();
  const rows = await all<PermissionRow[]>(
    "SELECT * FROM permission_slips WHERE employee_id = ? OR employee_email = ? ORDER BY requested_at DESC",
    [viewer.id, viewer.email],
  );
  return loadPermissions(rows);
}

export async function listPendingPermissionSlips() {
  const viewer = await requirePermissionViewer();
  if (!canViewPermissionQueue(viewer)) {
    throw new AppError("You don't have permission to view the Permission Slip queue.");
  }
  const rows = await all<PermissionRow[]>(
    "SELECT * FROM permission_slips WHERE status = 'pending_approval' ORDER BY requested_at ASC",
  );
  return loadPermissions(rows);
}

export async function getPermissionSlip(input: unknown) {
  const viewer = await requirePermissionViewer();
  const id = parseInput(permissionIdSchema, input);
  const slip = await loadPermission(id);
  if (!slip) throw new AppError("Permission slip not found.");
  if (!canView(viewer, slip)) throw new AppError("You don't have permission to view this slip.");
  return slip;
}

export async function approvePermissionSlip(input: unknown) {
  const viewer = await requirePermissionViewer();
  requireDepartmentHead(viewer);
  const data = parseInput(approvePermissionSchema, input);
  const slip = await loadPermission(data.id);
  if (!slip || slip.status !== "pending_approval") {
    throw new AppError("This permission slip is no longer awaiting approval.");
  }

  await withTransaction(async (conn) => {
    const update = await run(
      `UPDATE permission_slips
       SET status = 'approved', department_head_id = ?, department_head_name = ?,
           department_head_signature = ?, approved_at = NOW(), updated_at = NOW()
       WHERE id = ? AND status = 'pending_approval'`,
      [viewer.id, viewer.name, data.signature, data.id],
      conn,
    );
    if (update.affectedRows !== 1) {
      throw new AppError("This Permission Slip was already decided by another signatory.");
    }
    await run(
      `INSERT INTO permission_history
        (id, permission_slip_id, actor_id, actor_name, actor_role, type, message)
       VALUES (?, ?, ?, ?, 'department_head', 'approved', ?)`,
      [
        randomUUID(),
        data.id,
        viewer.id,
        viewer.name,
        "Permission slip approved by an assigned signatory.",
      ],
      conn,
    );
  });

  const emailDelivery = data.sendEmail
    ? await sendPermissionSlipEmail({
        kind: "employee_approved",
        recipientName: slip.employeeName,
        recipientEmail: slip.employeeEmail,
        permissionId: slip.id,
        employeeName: slip.employeeName,
        department: slip.department,
        requestedDate: slip.requestedDate,
        timeOut: slip.timeOut,
        timeIn: slip.timeIn,
        reason: slip.reason,
        ...(data.receiptImage
          ? {
              attachment: {
                filename: `permission-slip-${slip.id}.png`,
                mime: "image/png",
                content: Buffer.from(data.receiptImage.split(",")[1] ?? "", "base64"),
              },
            }
          : {}),
      })
    : {
        sent: false as const,
        delivered: 0,
        failed: 0,
        message: "The Permission Slip was approved without sending an email.",
      };
  return { emailDelivery };
}

export async function rejectPermissionSlip(input: unknown) {
  const viewer = await requirePermissionViewer();
  requireDepartmentHead(viewer);
  const data = parseInput(rejectPermissionSchema, input);
  const slip = await loadPermission(data.id);
  if (!slip || slip.status !== "pending_approval") {
    throw new AppError("This permission slip is no longer awaiting approval.");
  }
  await withTransaction(async (conn) => {
    const update = await run(
      `UPDATE permission_slips SET status = 'rejected', rejection_reason = ?, rejected_at = NOW(), updated_at = NOW()
       WHERE id = ? AND status = 'pending_approval'`,
      [data.reason, data.id],
      conn,
    );
    if (update.affectedRows !== 1) {
      throw new AppError("This Permission Slip was already decided by another signatory.");
    }
    await run(
      `INSERT INTO permission_history
        (id, permission_slip_id, actor_id, actor_name, actor_role, type, message)
       VALUES (?, ?, ?, ?, 'department_head', 'rejected', ?)`,
      [randomUUID(), data.id, viewer.id, viewer.name, `Permission slip rejected: ${data.reason}`],
      conn,
    );
  });
  const emailDelivery = await sendPermissionSlipEmail({
    kind: "employee_rejected",
    recipientName: slip.employeeName,
    recipientEmail: slip.employeeEmail,
    permissionId: slip.id,
    employeeName: slip.employeeName,
    department: slip.department,
    requestedDate: slip.requestedDate,
    timeOut: slip.timeOut,
    timeIn: slip.timeIn,
    reason: slip.reason,
    rejectionReason: data.reason,
  });
  return { emailDelivery };
}

export async function persistPermissionSlipReceipt(input: unknown) {
  await requireReceiptArchiver();
  const data = parseInput(sendPermissionReceiptSchema, input);
  const slip = await loadPermission(data.id);
  if (!slip) throw new AppError("Permission slip not found.");
  if (slip.status !== "approved") {
    throw new AppError("The Permission Slip must be approved before archiving its receipt.");
  }
  await run("UPDATE permission_slips SET receipt_image = ?, updated_at = NOW() WHERE id = ?", [
    Buffer.from(data.receiptImage.split(",")[1] ?? "", "base64"),
    slip.id,
  ]);
  return { ok: true };
}

export async function sendPermissionSlipReceipt(input: unknown) {
  await requireReceiptArchiver();
  const data = parseInput(sendPermissionReceiptSchema, input);
  const slip = await loadPermission(data.id);
  if (!slip) throw new AppError("Permission slip not found.");
  if (slip.status !== "approved") {
    throw new AppError("The Permission Slip must be approved before sending the receipt.");
  }
  await run("UPDATE permission_slips SET receipt_image = ? WHERE id = ? AND status = 'approved'", [
    Buffer.from(data.receiptImage.split(",")[1] ?? "", "base64"),
    slip.id,
  ]);

  const emailDelivery = await sendPermissionSlipEmail({
    kind: "employee_approved",
    recipientName: slip.employeeName,
    recipientEmail: slip.employeeEmail,
    permissionId: slip.id,
    employeeName: slip.employeeName,
    department: slip.department,
    requestedDate: slip.requestedDate,
    timeOut: slip.timeOut,
    timeIn: slip.timeIn,
    reason: slip.reason,
    attachment: {
      filename: `permission-slip-${slip.id}.png`,
      mime: "image/png",
      content: Buffer.from(data.receiptImage.split(",")[1] ?? "", "base64"),
    },
  });

  if (emailDelivery.sent) {
    await run(
      `INSERT INTO permission_history
        (id, permission_slip_id, actor_id, actor_name, actor_role, type, message)
       VALUES (?, ?, ?, ?, 'department_head', 'approved', ?)`,
      [
        randomUUID(),
        slip.id,
        viewer.id,
        viewer.name,
        `Permission slip receipt sent to ${slip.employeeEmail} via Gmail.`,
      ],
    );
  }

  return { emailDelivery };
}
