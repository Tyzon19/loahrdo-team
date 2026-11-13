import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { AppError, parseInput } from "@/lib/errors";
import {
  approvePermissionSchema,
  createPermissionSchema,
  permissionIdSchema,
  rejectPermissionSchema,
  sendPermissionReceiptSchema,
} from "@/lib/permission-schema";
import {
  isPermissionHead,
  PERMISSION_HEAD_EMAIL,
  type PermissionViewer,
} from "@/lib/permission-access";
import { all, run, withTransaction } from "../db";
import { requirePermissionViewer } from "./auth";
import { sendPermissionSlipEmail } from "../gmail";

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
  return isPermissionHead(viewer) || viewer.id === slip.employeeId;
}

function requireDepartmentHead(viewer: PermissionViewer) {
  if (!isPermissionHead(viewer)) {
    throw new AppError("Only the HRDO Department Head can approve permission slips.");
  }
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

  const head = await all<HeadRow[]>(
    "SELECT id, name, email FROM users WHERE email = ? AND role = 'department_head' LIMIT 1",
    [PERMISSION_HEAD_EMAIL],
  );
  const headUser = head[0];
  if (!headUser) throw new AppError("The HRDO Department Head account is not configured yet.");

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

  const emailDelivery = await sendPermissionSlipEmail({
    kind: "head_review",
    recipientName: headUser.name,
    recipientEmail: headUser.email,
    permissionId: id,
    employeeName: viewer.name,
    department: data.department,
    requestedDate: data.requestedDate,
    timeOut: data.timeOut,
    timeIn: data.timeIn,
    reason: data.reason,
  });
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
  requireDepartmentHead(viewer);
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
    await run(
      `UPDATE permission_slips
       SET status = 'approved', department_head_id = ?, department_head_name = ?,
           department_head_signature = ?, approved_at = NOW(), updated_at = NOW()
       WHERE id = ? AND status = 'pending_approval'`,
      [viewer.id, viewer.name, data.signature, data.id],
      conn,
    );
    await run(
      `INSERT INTO permission_history
        (id, permission_slip_id, actor_id, actor_name, actor_role, type, message)
       VALUES (?, ?, ?, ?, 'department_head', 'approved', ?)`,
      [
        randomUUID(),
        data.id,
        viewer.id,
        viewer.name,
        "Permission slip approved by HRDO Department Head.",
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
    await run(
      `UPDATE permission_slips SET status = 'rejected', rejection_reason = ?, rejected_at = NOW(), updated_at = NOW()
       WHERE id = ? AND status = 'pending_approval'`,
      [data.reason, data.id],
      conn,
    );
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

export async function sendPermissionSlipReceipt(input: unknown) {
  const viewer = await requirePermissionViewer();
  requireDepartmentHead(viewer);
  const data = parseInput(sendPermissionReceiptSchema, input);
  const slip = await loadPermission(data.id);
  if (!slip) throw new AppError("Permission slip not found.");
  if (slip.status !== "approved") {
    throw new AppError("The Permission Slip must be approved before sending the receipt.");
  }

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
