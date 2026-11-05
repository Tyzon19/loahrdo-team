/**
 * COE request storage and processing for the HRDO system.
 *
 * Requests live in `hrdo_coe_requests`, signed PDFs in `hrdo_coe_documents` and
 * every meaningful step in `hrdo_coe_history`. Employees only ever see their own
 * requests; HRDO staff see every request and move it through the workflow.
 */
import type { RowDataPacket } from "mysql2/promise";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import JSZip from "jszip";
import type {
  CoeCopyType,
  CoeHistoryEntry,
  CoeHistoryRecord,
  CoeRequest,
  CoeStatus,
  HrdoViewer,
} from "@/lib/hrdo";
import { COE_MAX_DOCUMENT_BYTES, coeNeedsDocument } from "@/lib/hrdo";
import { AppError, parseInput } from "@/lib/errors";
import { all, likePattern, run, withTransaction, type Db } from "../db";
import { sendCoeReleaseEmail, sendCoeStatusEmail } from "../gmail";
import { requireHrdoViewer } from "./auth";
import { join } from "node:path";

const submitSchema = z.object({
  employeeName: z
    .string()
    .trim()
    .min(5, "Enter employee name.")
    .max(120, "Name must be 120 characters or fewer."),
  purpose: z
    .string()
    .trim()
    .min(5, "Describe the purpose of the request (at least 5 characters).")
    .max(255, "Purpose must be 255 characters or fewer."),
  employeeEmail: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(255, "Email address must be 255 characters or fewer."),
  department: z
    .string()
    .trim()
    .min(2, "Choose or enter a valid department or office.")
    .max(120, "Department must be 120 characters or fewer.")
    .optional()
    .default(""),
  note: z.string().trim().max(2000, "Notes must be 2,000 characters or fewer.").default(""),
  employeeNumber: z
    .string()
    .trim()
    .max(40, "Employee ID must be 40 characters or fewer.")
    .optional()
    .default(""),
  contactNumber: z
    .string()
    .trim()
    .refine(
      (value) => !value || /^(09\d{9}|\+639\d{9})$/.test(value),
      "Enter a valid Philippine mobile number.",
    )
    .optional()
    .default(""),
  copyType: z.enum(["soft", "original", "both"], {
    message: "Choose the type of copy you need.",
  }),
});

const idSchema = z.object({
  id: z.string().uuid("Invalid request reference."),
});

const correctionSchema = z.object({
  id: z.string().uuid("Invalid request reference."),
  message: z
    .string()
    .trim()
    .min(10, "Explain what the employee needs to correct (at least 10 characters).")
    .max(2000, "Messages must be 2,000 characters or fewer."),
});

const rejectSchema = z.object({
  id: z.string().uuid("Invalid request reference."),
  remarks: z
    .string()
    .trim()
    .min(5, "Give a reason for rejecting the request (at least 5 characters).")
    .max(2000, "Remarks must be 2,000 characters or fewer."),
});

const releaseSchema = z.object({
  id: z.string().uuid("Invalid request reference."),
  receivedByName: z
    .string()
    .trim()
    .min(2, "Record who received the document.")
    .max(120, "Name must be 120 characters or fewer."),
});

const uploadSchema = z.object({
  id: z.string().uuid("Invalid request reference."),
  fileName: z.string().trim().min(1, "The uploaded file needs a name.").max(255),
  dataUrl: z.string().min(32, "Choose a signed PDF to upload.").max(9_000_000),
});

const templateSchema = z.object({
  id: z.string().uuid("Invalid request reference."),
  employeeName: z.string().trim().min(2).max(120),
  dateHired: z.string().trim().max(40).default(""),
  position: z.string().trim().max(120).default(""),
  department: z.string().trim().max(190).default(""),
  compensationWords: z.string().trim().max(120).default(""),
  compensationAmount: z.string().trim().max(40).default(""),
  purpose: z.string().trim().min(5).max(255),
  issueDate: z.string().trim().min(8).max(40),
  preparedByName: z.string().trim().min(2).max(120),
  includeCompensation: z.boolean().default(false),
});

const resubmitSchema = submitSchema.extend({
  id: z.string().uuid("Invalid request reference."),
  department: z
    .string()
    .trim()
    .min(2, "Choose or enter a valid department or office.")
    .max(120, "Department must be 120 characters or fewer.")
    .optional()
    .default(""),
});

const staffRequestQueueSchema = z.enum(["all", "new", "review", "processing", "due", "ready"]);
const staffRequestSortSchema = z.enum([
  "priority",
  "date_newest",
  "date_oldest",
  "requestor_asc",
  "requestor_desc",
  "department_asc",
  "department_desc",
  "id_asc",
  "id_desc",
]);
const dateOnlySchema = z
  .string()
  .refine((value) => {
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid date.")
  .default("");
const staffRequestListSchema = z
  .object({
    query: z.string().trim().max(100).default(""),
    department: z.string().trim().max(120).default(""),
    dateFrom: dateOnlySchema,
    dateTo: dateOnlySchema,
    queue: staffRequestQueueSchema.default("all"),
    sort: staffRequestSortSchema.default("priority"),
    page: z.number().int().min(0).max(1_000_000).default(0),
  })
  .refine((data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo, {
    path: ["dateTo"],
    message: "The end date must be on or after the start date.",
  });

interface CoeRow extends RowDataPacket {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  employee_number: string;
  department: string;
  purpose: string;
  note: string | null;
  copy_type: CoeCopyType;
  status: CoeStatus;
  remarks: string | null;
  correction_message: string | null;
  processed_by_name: string | null;
  requested_at_ms: number | string | null;
  deadline_at_ms: number | string | null;
  updated_at_ms: number | string | null;
  verified_at_ms: number | string | null;
  verified_at: string | null;
  verified_by_name: string | null;
  correction_requested_at_ms: number | string | null;
  finalized_at_ms: number | string | null;
  ready_at_ms: number | string | null;
  released_at_ms: number | string | null;
  released_by_name: string | null;
  received_by_name: string | null;
  has_document: number | null;
  document_file_name: string | null;
}

interface CoeHistoryRow extends RowDataPacket {
  id: string;
  request_id: string;
  actor_name: string;
  actor_role: "employee" | "hrdo_staff" | "system";
  type: CoeHistoryEntry["type"];
  message: string;
  happened_at_ms: number | string | null;
}

/**
 * DATETIME columns are stored in the database's local time. MySQL converts them
 * to a real epoch with UNIX_TIMESTAMP, so deadlines compare correctly no matter
 * which timezone the server runs in.
 */
function isoFromMs(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const ms = Number(value) * 1000;
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString();
}

function mapRow(row: CoeRow, history: CoeHistoryEntry[] = []): CoeRequest {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employeeEmail: row.employee_email,
    employeeNumber: row.employee_number,
    department: row.department,
    purpose: row.purpose,
    note: row.note ?? "",
    copyType: row.copy_type,
    status: row.status,
    remarks: row.remarks ?? "",
    correctionMessage: row.correction_message ?? "",
    processedByName: row.processed_by_name ?? "",
    requestedAt: isoFromMs(row.requested_at_ms),
    deadlineAt: isoFromMs(row.deadline_at_ms),
    updatedAt: isoFromMs(row.updated_at_ms),
    verifiedAt: isoFromMs(row.verified_at_ms),
    verifiedByName: row.verified_by_name ?? "",
    correctionRequestedAt: isoFromMs(row.correction_requested_at_ms),
    finalizedAt: isoFromMs(row.finalized_at_ms),
    readyAt: isoFromMs(row.ready_at_ms),
    releasedAt: isoFromMs(row.released_at_ms),
    releasedByName: row.released_by_name ?? "",
    receivedByName: row.received_by_name ?? "",
    hasDocument: Boolean(row.has_document),
    documentFileName: row.document_file_name ?? "",
    history,
  };
}

function mapHistory(row: CoeHistoryRow): CoeHistoryEntry {
  return {
    id: row.id,
    requestId: row.request_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    type: row.type,
    message: row.message,
    happenedAt: isoFromMs(row.happened_at_ms),
  };
}

const SELECT_COLUMNS = `c.id, c.employee_id, c.employee_name, c.employee_email, c.employee_number,
                        c.department, c.purpose, c.note, c.copy_type, c.status, c.remarks,
                        c.correction_message, c.processed_by_name, c.verified_at, c.verified_by_name,
                        c.released_by_name, c.received_by_name,
                        UNIX_TIMESTAMP(c.requested_at) AS requested_at_ms,
                        UNIX_TIMESTAMP(c.deadline_at) AS deadline_at_ms,
                        UNIX_TIMESTAMP(c.updated_at) AS updated_at_ms,
                        UNIX_TIMESTAMP(c.verified_at) AS verified_at_ms,
                        UNIX_TIMESTAMP(c.correction_requested_at) AS correction_requested_at_ms,
                        UNIX_TIMESTAMP(c.finalized_at) AS finalized_at_ms,
                        UNIX_TIMESTAMP(c.ready_at) AS ready_at_ms,
                        UNIX_TIMESTAMP(c.released_at) AS released_at_ms,
                        EXISTS (SELECT 1 FROM hrdo_coe_documents d WHERE d.request_id = c.id) AS has_document,
                        (SELECT d.file_name FROM hrdo_coe_documents d WHERE d.request_id = c.id) AS document_file_name`;

const ORDER_PENDING_FIRST = `FIELD(c.status, 'pending', 'under_review', 'correction_requested',
                                 'processing', 'ready_for_pickup', 'released', 'rejected'),
                              c.deadline_at ASC, c.requested_at DESC`;

async function notifyEmployeeOfCoeStatus(
  status: CoeStatus,
  request: { id: string; employee_name: string; employee_email: string },
  title: string,
  message: string,
  attachment?: { filename: string; mime: string; content: Buffer },
  subject?: string,
) {
  if (!request.employee_email) return undefined;

  const emailResult = await sendCoeStatusEmail({
    recipientName: request.employee_name || "Employee",
    recipientEmail: request.employee_email,
    requestId: request.id,
    status,
    title,
    message,
    ...(attachment ? { attachment } : {}),
    ...(subject ? { subject } : {}),
  });

  if (!emailResult.sent) {
    console.warn(`[coe] COE status email for ${request.id} failed: ${emailResult.message}`);
  }

  return emailResult;
}

async function loadDocumentForEmail(
  requestId: string,
): Promise<{ fileName: string; mime: string; content: Buffer } | null> {
  const rows = await all<(RowDataPacket & { file_name: string; mime: string; content: Buffer })[]>(
    "SELECT file_name, mime, content FROM hrdo_coe_documents WHERE request_id = ? LIMIT 1",
    [requestId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    fileName: row.file_name,
    mime: row.mime,
    content: Buffer.from(row.content),
  };
}

async function addHistory(
  db: Db | undefined,
  requestId: string,
  actor: HrdoViewer | null,
  type: CoeHistoryEntry["type"],
  message: string,
) {
  await run(
    `INSERT INTO hrdo_coe_history (id, request_id, actor_name, actor_role, type, message, happened_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      crypto.randomUUID(),
      requestId,
      actor?.name ?? "System",
      actor ? actor.role : "system",
      type,
      message.slice(0, 500),
    ],
    db,
  );
}

async function loadHistory(requestId: string, db?: Db): Promise<CoeHistoryEntry[]> {
  const rows = await all<CoeHistoryRow[]>(
    `SELECT id, request_id, actor_name, actor_role, type, message,
            UNIX_TIMESTAMP(happened_at) AS happened_at_ms
     FROM hrdo_coe_history WHERE request_id = ?
     ORDER BY happened_at ASC, id ASC`,
    [requestId],
    db,
  );
  return rows.map(mapHistory);
}

async function loadRow(id: string, db?: Db, forUpdate = false): Promise<CoeRow> {
  const rows = await all<CoeRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM hrdo_coe_requests c WHERE c.id = ? LIMIT 1${
      forUpdate ? " FOR UPDATE" : ""
    }`,
    [id],
    db,
  );
  const row = rows[0];
  if (!row) throw new AppError("That COE request could not be found.");
  return row;
}

async function loadRequest(id: string): Promise<CoeRequest> {
  const row = await loadRow(id);
  return mapRow(row, await loadHistory(id));
}

function requireStaff(viewer: HrdoViewer) {
  if (viewer.role !== "hrdo_staff") {
    throw new AppError("Only HRDO staff can process COE requests.");
  }
}

function isPdf(bytes: Buffer) {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export async function submitCoeRequest(input: unknown): Promise<CoeRequest> {
  const viewer = await requireHrdoViewer();
  const data = parseInput(submitSchema, input);
  const id = crypto.randomUUID();
  const department = data.department?.trim() || viewer.department.trim() || "General";

  await withTransaction(async (conn) => {
    await run(
      `INSERT INTO hrdo_coe_requests
         (id, employee_id, employee_name, employee_email, employee_number, department,
          purpose, note, copy_type, deadline_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 3 DAY))`,
      [
        id,
        viewer.id,
        data.employeeName,
        data.employeeEmail,
        data.employeeNumber,
        department,
        data.purpose,
        data.note,
        data.copyType,
      ],
      conn,
    );
    await addHistory(conn, id, viewer, "submitted", "Certificate of Employment request submitted.");
  });

  const emailResult = await sendCoeStatusEmail({
    recipientName: data.employeeName,
    recipientEmail: data.employeeEmail,
    requestId: id,
    status: "pending",
    title: "Your COE request has been submitted",
    message:
      "We have received your Certificate of Employment request. It is now pending HRDO review. You will receive an email when its status changes.",
  });
  if (!emailResult.sent) {
    console.warn(
      `[coe] Request confirmation for ${id} to ${data.employeeEmail} failed: ${emailResult.message}`,
    );
  }

  return loadRequest(id);
}

export async function resubmitCoeRequest(input: unknown): Promise<CoeRequest> {
  const viewer = await requireHrdoViewer();
  const data = parseInput(resubmitSchema, input);

  await withTransaction(async (conn) => {
    const row = await loadRow(data.id, conn, true);
    if (row.employee_id !== viewer.id) {
      throw new AppError("That COE request could not be found.");
    }
    if (row.status !== "correction_requested") {
      throw new AppError("This request is no longer waiting for corrections.");
    }

    const department =
      data.department?.trim() || row.department.trim() || viewer.department.trim() || "General";

    // The original submission timestamp and deadline are deliberately preserved.
    await run(
      `UPDATE hrdo_coe_requests
       SET employee_name = ?, employee_email = ?, employee_number = ?, department = ?, purpose = ?, note = ?,
           copy_type = ?, correction_message = NULL, status = 'pending', updated_at = NOW()
       WHERE id = ?`,
      [
        data.employeeName,
        data.employeeEmail,
        data.employeeNumber,
        department,
        data.purpose,
        data.note,
        data.copyType,
        data.id,
      ],
      conn,
    );
    await addHistory(
      conn,
      data.id,
      viewer,
      "resubmitted",
      "Corrected request details submitted. The original submission date and deadline do not change.",
    );
  });

  return loadRequest(data.id);
}

export async function listMyCoeRequests(): Promise<CoeRequest[]> {
  const viewer = await requireHrdoViewer();
  const rows = await all<CoeRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM hrdo_coe_requests c
     WHERE c.employee_id = ?
     ORDER BY ${ORDER_PENDING_FIRST}
     LIMIT 100`,
    [viewer.id],
  );
  return rows.map((row) => mapRow(row));
}

export async function listAllCoeRequests(): Promise<CoeRequest[]> {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const rows = await all<CoeRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM hrdo_coe_requests c
     ORDER BY ${ORDER_PENDING_FIRST}
     LIMIT 300`,
  );
  return rows.map((row) => mapRow(row));
}

export async function searchStaffCoeRequests(input: unknown) {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const data = parseInput(staffRequestListSchema, input);
  const where: string[] = [];
  const params: unknown[] = [];

  if (data.query) {
    const pattern = likePattern(data.query);
    where.push(`(
      c.id LIKE ? OR c.employee_name LIKE ? OR c.employee_number LIKE ?
      OR c.department LIKE ? OR DATE_FORMAT(c.requested_at, '%Y-%m-%d') LIKE ?
    )`);
    params.push(pattern, pattern, pattern, pattern, pattern);
  }
  if (data.department) {
    where.push("c.department LIKE ?");
    params.push(likePattern(data.department));
  }
  if (data.dateFrom) {
    where.push("c.requested_at >= CONCAT(?, ' 00:00:00')");
    params.push(data.dateFrom);
  }
  if (data.dateTo) {
    where.push("c.requested_at < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY)");
    params.push(data.dateTo);
  }

  switch (data.queue) {
    case "new":
      where.push("c.status = 'pending'");
      break;
    case "review":
      where.push("c.status = 'under_review'");
      break;
    case "processing":
      where.push("c.status = 'processing'");
      break;
    case "ready":
      where.push("c.status = 'ready_for_pickup'");
      break;
    case "due":
      where.push(
        "c.status IN ('pending', 'under_review', 'correction_requested', 'processing') AND c.deadline_at <= DATE_ADD(NOW(), INTERVAL 24 HOUR)",
      );
      break;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderBy: Record<z.infer<typeof staffRequestSortSchema>, string> = {
    priority: `${ORDER_PENDING_FIRST}, c.id ASC`,
    date_newest: "c.requested_at DESC, c.id DESC",
    date_oldest: "c.requested_at ASC, c.id ASC",
    requestor_asc: "c.employee_name ASC, c.id ASC",
    requestor_desc: "c.employee_name DESC, c.id DESC",
    department_asc: "c.department ASC, c.id ASC",
    department_desc: "c.department DESC, c.id DESC",
    id_asc: "c.id ASC",
    id_desc: "c.id DESC",
  };
  const offset = data.page * 10;

  const [countRows, rows] = await Promise.all([
    all<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM hrdo_coe_requests c ${whereSql}`,
      params,
    ),
    all<CoeRow[]>(
      `SELECT ${SELECT_COLUMNS} FROM hrdo_coe_requests c
       ${whereSql}
       ORDER BY ${orderBy[data.sort]}
       LIMIT 10 OFFSET ?`,
      [...params, offset],
    ),
  ]);

  return {
    requests: rows.map((row) => mapRow(row)),
    total: Number(countRows[0]?.total ?? 0),
    page: data.page,
    pageSize: 10,
  };
}

export async function getCoeRequest(input: unknown): Promise<CoeRequest> {
  const viewer = await requireHrdoViewer();
  const data = parseInput(idSchema, input);
  const row = await loadRow(data.id);
  // Employees may only ever open their own COE request; HRDO staff may open any.
  if (viewer.role !== "hrdo_staff" && row.employee_id !== viewer.id) {
    throw new AppError("That COE request could not be found.");
  }
  return mapRow(row, await loadHistory(data.id));
}

export async function listCoeHistory(): Promise<CoeHistoryRecord[]> {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const rows = await all<(CoeHistoryRow & { employee_name: string; employee_number: string })[]>(
    `SELECT h.id, h.request_id, h.actor_name, h.actor_role, h.type, h.message,
            UNIX_TIMESTAMP(h.happened_at) AS happened_at_ms,
            c.employee_name, c.employee_number
     FROM hrdo_coe_history h
     JOIN hrdo_coe_requests c ON c.id = h.request_id
     ORDER BY h.happened_at DESC, h.id DESC
     LIMIT 250`,
  );
  return rows.map((row) => ({
    ...mapHistory(row),
    employeeName: row.employee_name,
    employeeNumber: row.employee_number,
  }));
}

export async function verifyCoeRequest(input: unknown): Promise<CoeRequest> {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const data = parseInput(idSchema, input);

  let emailRecipient: { id: string; employee_name: string; employee_email: string } | null = null;

  await withTransaction(async (conn) => {
    const row = await loadRow(data.id, conn, true);
    emailRecipient = {
      id: row.id,
      employee_name: row.employee_name,
      employee_email: row.employee_email,
    };
    if (row.status !== "pending" && row.status !== "under_review") {
      throw new AppError("Only new or under-review requests can be verified.");
    }
    if (row.verified_at) {
      throw new AppError(
        `This request has already been verified by ${row.verified_by_name || "HRDO staff"}. Duplicate verification is not allowed.`,
      );
    }
    await run(
      `UPDATE hrdo_coe_requests
       SET status = 'under_review', verified_at = NOW(), verified_by_name = ?,
           processed_by_id = ?, processed_by_name = ?, updated_at = NOW()
       WHERE id = ?`,
      [viewer.name, viewer.id, viewer.name, data.id],
      conn,
    );
    await addHistory(
      conn,
      data.id,
      viewer,
      "verified",
      "Employee information verified against official HR records.",
    );
  });

  if (emailRecipient) {
    await notifyEmployeeOfCoeStatus(
      "under_review",
      emailRecipient,
      "Your COE request has been verified.",
      "HRDO has checked the employee information and is now continuing with your request.",
    );
  }

  return loadRequest(data.id);
}

export async function startCoeProcessing(input: unknown): Promise<CoeRequest> {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const data = parseInput(idSchema, input);

  let emailRecipient: { id: string; employee_name: string; employee_email: string } | null = null;

  await withTransaction(async (conn) => {
    const row = await loadRow(data.id, conn, true);
    emailRecipient = {
      id: row.id,
      employee_name: row.employee_name,
      employee_email: row.employee_email,
    };
    if (row.status === "processing") {
      throw new AppError(
        `This request is already being processed by ${row.processed_by_name || "HRDO staff"}. Duplicate processing is not allowed.`,
      );
    }
    if (row.status !== "under_review") {
      throw new AppError("Verify the request before starting the COE preparation.");
    }
    if (!row.verified_at) {
      throw new AppError("Verify the employee information before starting the COE preparation.");
    }
    await run(
      `UPDATE hrdo_coe_requests
       SET status = 'processing', processed_by_id = ?, processed_by_name = ?, updated_at = NOW()
       WHERE id = ?`,
      [viewer.id, viewer.name, data.id],
      conn,
    );
    await addHistory(conn, data.id, viewer, "processing", "COE preparation started.");
  });

  if (emailRecipient) {
    await notifyEmployeeOfCoeStatus(
      "processing",
      emailRecipient,
      "Your COE request is now being processed.",
      "HRDO has started preparing your certificate and will update you if they need more information.",
    );
  }

  return loadRequest(data.id);
}

export async function requestCoeCorrection(input: unknown): Promise<CoeRequest> {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const data = parseInput(correctionSchema, input);

  let emailRecipient: { id: string; employee_name: string; employee_email: string } | null = null;

  await withTransaction(async (conn) => {
    const row = await loadRow(data.id, conn, true);
    emailRecipient = {
      id: row.id,
      employee_name: row.employee_name,
      employee_email: row.employee_email,
    };
    if (row.status === "correction_requested") {
      throw new AppError(
        `This request is already waiting for correction from the employee. Duplicate correction requests are not allowed.`,
      );
    }
    if (!["pending", "under_review", "processing"].includes(row.status)) {
      throw new AppError("This request can no longer be sent back for correction.");
    }
    await run(
      `UPDATE hrdo_coe_requests
       SET status = 'correction_requested', correction_message = ?, correction_requested_at = NOW(),
           processed_by_id = ?, processed_by_name = ?, updated_at = NOW()
       WHERE id = ?`,
      [data.message, viewer.id, viewer.name, data.id],
      conn,
    );
    await addHistory(
      conn,
      data.id,
      viewer,
      "correction_requested",
      `Correction requested: ${data.message}`,
    );
  });

  if (emailRecipient) {
    await notifyEmployeeOfCoeStatus(
      "correction_requested",
      emailRecipient,
      "Action needed for your COE request.",
      data.message,
    );
  }

  return loadRequest(data.id);
}

export async function rejectCoeRequest(input: unknown): Promise<CoeRequest> {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const data = parseInput(rejectSchema, input);

  let emailRecipient: { id: string; employee_name: string; employee_email: string } | null = null;

  await withTransaction(async (conn) => {
    const row = await loadRow(data.id, conn, true);
    emailRecipient = {
      id: row.id,
      employee_name: row.employee_name,
      employee_email: row.employee_email,
    };
    if (row.status === "rejected") {
      throw new AppError(
        "This request has already been rejected. Duplicate rejection is not allowed.",
      );
    }
    if (!["pending", "under_review", "correction_requested", "processing"].includes(row.status)) {
      throw new AppError("This request can no longer be rejected.");
    }
    await run(
      `UPDATE hrdo_coe_requests
       SET status = 'rejected', remarks = ?, processed_by_id = ?, processed_by_name = ?, updated_at = NOW()
       WHERE id = ?`,
      [data.remarks, viewer.id, viewer.name, data.id],
      conn,
    );
    await addHistory(conn, data.id, viewer, "rejected", `Request rejected: ${data.remarks}`);
  });

  if (emailRecipient) {
    await notifyEmployeeOfCoeStatus(
      "rejected",
      emailRecipient,
      "Your COE request was not approved.",
      data.remarks,
    );
  }

  return loadRequest(data.id);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function ordinalSuffix(day: number) {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  if (day % 10 === 1) return "st";
  if (day % 10 === 2) return "nd";
  if (day % 10 === 3) return "rd";
  return "th";
}

function removeLeadingTitle(name: string) {
  return name.replace(/^(?:mr|ms|mrs|miss|dr|atty|engr|prof|mx)\.?\s+/i, "").trim();
}

function replaceTextRuns(xml: string, replacements: Record<number, string>) {
  let index = 0;
  return xml.replace(
    /<w:t([^>]*)>([\s\S]*?)<\/w:t>/g,
    (match, attributes: string, _value: string) => {
      const replacement = replacements[index];
      index += 1;
      if (replacement === undefined) return match;

      const needsPreservedSpace = /^\s|\s$/.test(replacement);
      const preservedAttributes = needsPreservedSpace
        ? attributes.includes("xml:space=")
          ? attributes.replace(/xml:space="[^"]*"/, 'xml:space="preserve"')
          : `${attributes} xml:space="preserve"`
        : attributes;

      return `<w:t${preservedAttributes}>${escapeXml(replacement)}</w:t>`;
    },
  );
}

async function buildCoeTemplate(data: z.infer<typeof templateSchema>) {
  const request = await loadRequest(data.id);
  if (!request) throw new AppError("COE request not found.");
  if (request.status !== "processing") {
    throw new AppError("Start processing the request before generating the COE template.");
  }

  const templatePath = path.join(process.cwd(), "public", "COE FORMAT.docx");
  const template = await readFile(templatePath);
  const zip = await JSZip.loadAsync(template);
  const document = zip.file("word/document.xml");
  if (!document) throw new AppError("The COE template document.xml is missing.");

  const xml = await document.async("string");
  const issueDate = new Date(data.issueDate);
  if (Number.isNaN(issueDate.getTime())) throw new AppError("Enter a valid issue date.");
  const issueDay = String(issueDate.getDate());
  const issueMonth = issueDate.toLocaleDateString("en-PH", { month: "long" });
  const issueYear = String(issueDate.getFullYear());
  const employeeName = removeLeadingTitle(data.employeeName);
  const surname = employeeName.split(/\s+/).at(-1) ?? employeeName;
  const titleMatch = request.note.match(/(?:^|\| )Title: ([^|\n]+)/i);
  const subjectTitleMatch = request.note.match(/(?:^|\| )Subject title: ([^|\n]+)/i);
  const title = (titleMatch?.[1] || subjectTitleMatch?.[1] || "").trim();
  const titleWithPunctuation = title ? `${title}. ` : "";
  const replacementXml = replaceTextRuns(xml, {
    9: title,
    10: title ? ". " : "",
    11: employeeName,
    18: `${data.dateHired || "________________"} up to present as `,
    19: data.position || "________________",
    23: `${data.department || "________________"} `,
    ...(data.includeCompensation
      ? {
          26: data.compensationWords || "________________",
          27: "",
          28: "",
          29: "",
          33: data.compensationAmount || "____________",
        }
      : {
          24: "",
          25: "",
          26: "",
          27: "",
          28: "",
          29: "",
          30: "",
          31: "",
          32: "",
          33: "",
          34: "",
          35: "",
        }),
    38: `of ${titleWithPunctuation}`,
    39: surname,
    43: ` ${data.purpose}`,
    47: issueDay,
    48: ordinalSuffix(issueDate.getDate()),
    51: `${issueMonth} `,
    52: `${issueYear}.`,
    55: ` ${data.preparedByName}`,
  });
  zip.file("word/document.xml", replacementXml);
  const output = await zip.generateAsync({ type: "nodebuffer" });
  const fileName = `COE-${request.employeeName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "request"}.docx`;
  return {
    request,
    fileName,
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    content: output,
  };
}

/** Builds the review copy only. Nothing is emailed until `sendCoeTemplate` is called. */
export async function generateCoeTemplate(input: unknown) {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const data = parseInput(templateSchema, input);
  const { fileName, mime, content } = await buildCoeTemplate(data);
  return { fileName, mime, base64: content.toString("base64") };
}

export async function sendCoeTemplate(input: unknown) {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const data = parseInput(templateSchema, input);
  const { request, fileName, mime, content } = await buildCoeTemplate(data);
  if (!request.employeeEmail) {
    throw new AppError("This request has no employee email address to send the template to.");
  }

  const emailResult = await notifyEmployeeOfCoeStatus(
    "processing",
    {
      id: request.id,
      employee_name: request.employeeName,
      employee_email: request.employeeEmail,
    },
    "Your filled COE template is ready for review.",
    "HRDO has prepared your Certificate of Employment template. Please review the attached Word document and contact HRDO if any information needs correction.",
    { filename: fileName, mime, content },
    "Your filled COE template is ready for review",
  );

  if (!emailResult?.sent) {
    throw new AppError(
      `The template could not be emailed to ${request.employeeEmail}. ${emailResult?.message ?? "Contact the system administrator."}`,
    );
  }

  return { recipientEmail: request.employeeEmail };
}

export async function uploadCoeDocument(input: unknown): Promise<CoeRequest> {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const data = parseInput(uploadSchema, input);

  if (!data.dataUrl.startsWith("data:application/pdf;base64,")) {
    throw new AppError("Upload the signed COE as a PDF file.");
  }

  const bytes = Buffer.from(data.dataUrl.slice(data.dataUrl.indexOf(",") + 1), "base64");
  if (!isPdf(bytes)) {
    throw new AppError("That file is not a valid PDF.");
  }
  if (bytes.length > COE_MAX_DOCUMENT_BYTES) {
    throw new AppError("The signed COE must be 5 MB or smaller.");
  }

  let releaseEmailPayload: {
    requestId: string;
    recipientName: string;
    recipientEmail: string;
    copyType: CoeCopyType;
    attachment?: { filename: string; mime: string; content: Buffer };
  } | null = null;

  await withTransaction(async (conn) => {
    const row = await loadRow(data.id, conn, true);
    if (row.status !== "processing") {
      throw new AppError("Start processing the request before uploading the signed COE.");
    }
    if (!coeNeedsDocument(row.copy_type)) {
      throw new AppError("This request only needs a printed original, so no PDF is uploaded.");
    }

    await run(
      `INSERT INTO hrdo_coe_documents
         (request_id, file_name, mime, size_bytes, content, uploaded_by_id, uploaded_by_name)
       VALUES (?, ?, 'application/pdf', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         file_name = VALUES(file_name), size_bytes = VALUES(size_bytes), content = VALUES(content),
         uploaded_by_id = VALUES(uploaded_by_id), uploaded_by_name = VALUES(uploaded_by_name),
         uploaded_at = NOW()`,
      [data.id, data.fileName, bytes.length, bytes, viewer.id, viewer.name],
      conn,
    );
    await run(
      `UPDATE hrdo_coe_requests
       SET processed_by_id = ?, processed_by_name = ?, finalized_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [viewer.id, viewer.name, data.id],
      conn,
    );
    await addHistory(
      conn,
      data.id,
      viewer,
      "document_uploaded",
      `Signed COE uploaded (${data.fileName}).`,
    );

    // Soft copy only: the signed PDF is the release.
    if (row.copy_type === "soft") {
      await run(
        `UPDATE hrdo_coe_requests
         SET status = 'released', released_at = NOW(), released_by_name = ?, updated_at = NOW()
         WHERE id = ?`,
        [viewer.name, data.id],
        conn,
      );
      await addHistory(
        conn,
        data.id,
        viewer,
        "released",
        "Signed COE released online to the employee.",
      );
      releaseEmailPayload = {
        requestId: data.id,
        recipientName: row.employee_name,
        recipientEmail: row.employee_email,
        copyType: row.copy_type,
        attachment: { filename: data.fileName, mime: "application/pdf", content: bytes },
      };
    } else if (row.copy_type === "both") {
      releaseEmailPayload = {
        requestId: data.id,
        recipientName: row.employee_name,
        recipientEmail: row.employee_email,
        copyType: row.copy_type,
        attachment: { filename: data.fileName, mime: "application/pdf", content: bytes },
      };
    }
  });

  if (releaseEmailPayload) {
    const emailResult = await sendCoeReleaseEmail(releaseEmailPayload);
    if (!emailResult.sent) {
      console.warn(
        `[coe] Release email failed for ${(releaseEmailPayload as { requestId: string }).requestId}: ${emailResult.message}`,
      );
      throw new AppError(
        `The COE was released in the system, but the employee email could not be sent: ${emailResult.message}`,
      );
    }
  }

  return loadRequest(data.id);
}

export async function markCoeReady(input: unknown): Promise<CoeRequest> {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const data = parseInput(idSchema, input);

  let emailRecipient: { id: string; employee_name: string; employee_email: string } | null = null;

  await withTransaction(async (conn) => {
    const row = await loadRow(data.id, conn, true);
    emailRecipient = {
      id: row.id,
      employee_name: row.employee_name,
      employee_email: row.employee_email,
    };
    if (row.status === "ready_for_pickup") {
      throw new AppError(
        `This request is already marked ready for pickup by ${row.processed_by_name || "HRDO staff"}. Duplicate readiness updates are not allowed.`,
      );
    }
    if (row.status !== "processing") {
      throw new AppError("Only requests under processing can be marked ready for pickup.");
    }
    if (!row.verified_at) {
      throw new AppError("Verify the employee information before releasing the document.");
    }
    if (row.copy_type === "soft") {
      throw new AppError(
        "Soft-copy requests are released online after the signed PDF is uploaded.",
      );
    }
    if (row.copy_type === "both" && !row.has_document) {
      throw new AppError("Upload the signed PDF before marking this request ready for pickup.");
    }
    await run(
      `UPDATE hrdo_coe_requests
       SET status = 'ready_for_pickup', ready_at = NOW(), processed_by_id = ?,
           processed_by_name = ?, updated_at = NOW()
       WHERE id = ?`,
      [viewer.id, viewer.name, data.id],
      conn,
    );
    await addHistory(
      conn,
      data.id,
      viewer,
      "ready_for_pickup",
      "Printed COE is ready for pickup at the HRDO desk.",
    );
  });

  if (emailRecipient) {
    const document = await loadDocumentForEmail(data.id);
    await notifyEmployeeOfCoeStatus(
      "ready_for_pickup",
      emailRecipient,
      "Your COE is ready for pickup.",
      "Please visit the HRDO office and present any required identification when claiming your certificate.",
      document
        ? {
            filename: document.fileName,
            mime: document.mime,
            content: document.content,
          }
        : undefined,
    );
  }

  return loadRequest(data.id);
}

export async function releaseCoeDocument(input: unknown): Promise<CoeRequest> {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const data = parseInput(releaseSchema, input);

  let statusEmailRecipient: { id: string; employee_name: string; employee_email: string } | null =
    null;

  const releaseEmailPayload = await withTransaction(async (conn) => {
    const row = await loadRow(data.id, conn, true);
    statusEmailRecipient = {
      id: row.id,
      employee_name: row.employee_name,
      employee_email: row.employee_email,
    };
    if (row.status === "released") {
      throw new AppError(
        `This COE has already been released by ${row.released_by_name || "HRDO staff"}. Duplicate release records are not allowed.`,
      );
    }
    if (row.status !== "ready_for_pickup") {
      throw new AppError("Only requests that are ready for pickup can be released.");
    }
    await run(
      `UPDATE hrdo_coe_requests
       SET status = 'released', released_at = NOW(), released_by_name = ?, received_by_name = ?,
           processed_by_id = ?, processed_by_name = ?, updated_at = NOW()
       WHERE id = ?`,
      [viewer.name, data.receivedByName, viewer.id, viewer.name, data.id],
      conn,
    );
    await addHistory(
      conn,
      data.id,
      viewer,
      "released",
      `Printed COE released to ${data.receivedByName}.`,
    );

    const document = await loadDocumentForEmail(data.id);
    const payload: {
      requestId: string;
      recipientName: string;
      recipientEmail: string;
      employeeName: string;
      copyType: CoeCopyType;
      attachment?: { filename: string; mime: string; content: Buffer };
    } = {
      requestId: data.id,
      recipientName: row.employee_name,
      recipientEmail: row.employee_email,
      employeeName: row.employee_name,
      copyType: row.copy_type,
    };
    if (document) {
      payload.attachment = {
        filename: document.fileName,
        mime: document.mime,
        content: document.content,
      };
    }
    return payload;
  });

  if (releaseEmailPayload) {
    const emailResult = await sendCoeReleaseEmail(releaseEmailPayload);
    if (!emailResult.sent) {
      console.warn(
        `[coe] Release email failed for ${releaseEmailPayload.requestId}: ${emailResult.message}`,
      );
      throw new AppError(
        `The COE was released in the system, but the employee email could not be sent: ${emailResult.message}`,
      );
    }
  }

  if (statusEmailRecipient) {
    const document = await loadDocumentForEmail(data.id);
    const statusEmailResult = await notifyEmployeeOfCoeStatus(
      "released",
      statusEmailRecipient,
      "Your COE has been released.",
      "The HRDO staff has confirmed the release and the status is now complete.",
      document
        ? {
            filename: document.fileName,
            mime: document.mime,
            content: document.content,
          }
        : undefined,
    );
    if (statusEmailResult && !statusEmailResult.sent) {
      throw new AppError(
        `The COE was released, but the status email could not be delivered: ${statusEmailResult.message}`,
      );
    }
  }

  return loadRequest(data.id);
}

export async function getCoeDocument(
  input: unknown,
): Promise<{ fileName: string; mime: string; base64: string }> {
  const viewer = await requireHrdoViewer();
  const data = parseInput(idSchema, input);

  const request = await getCoeRequest(data);
  if (viewer.role !== "hrdo_staff" && !["ready_for_pickup", "released"].includes(request.status)) {
    throw new AppError("This document has not been released yet.");
  }

  const rows = await all<(RowDataPacket & { file_name: string; mime: string; content: Buffer })[]>(
    "SELECT file_name, mime, content FROM hrdo_coe_documents WHERE request_id = ? LIMIT 1",
    [data.id],
  );
  const row = rows[0];
  if (!row) throw new AppError("No signed COE has been uploaded for this request yet.");
  return {
    fileName: row.file_name,
    mime: row.mime,
    base64: Buffer.from(row.content).toString("base64"),
  };
}
