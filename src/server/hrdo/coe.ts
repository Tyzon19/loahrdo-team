/**
 * COE request storage and processing for the HRDO system.
 *
 * Requests live in `hrdo_coe_requests`, signed PDFs in `hrdo_coe_documents` and
 * every meaningful step in `hrdo_coe_history`. Employees only ever see their own
 * requests; HRDO staff see every request and move it through the workflow.
 */
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import type {
  CoeCopyType,
  CoeHistoryEntry,
  CoeHistoryRecord,
  CoeRequest,
  CoeStatus,
} from "@/lib/hrdo";
import { COE_MAX_DOCUMENT_BYTES, coeNeedsDocument } from "@/lib/hrdo";
import { AppError, parseInput } from "@/lib/errors";
import { all, run, withTransaction, type Db } from "../db";
import { requireHrdoViewer } from "./auth";
import type { HrdoViewer } from "@/lib/hrdo";

const submitSchema = z.object({
  purpose: z
    .string()
    .trim()
    .min(5, "Describe the purpose of the request (at least 5 characters).")
    .max(255, "Purpose must be 255 characters or fewer."),
  note: z.string().trim().max(2000, "Notes must be 2,000 characters or fewer.").default(""),
  employeeNumber: z
    .string()
    .trim()
    .min(3, "Enter your Employee ID (at least 3 characters).")
    .max(40, "Employee ID must be 40 characters or fewer."),
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

const resubmitSchema = submitSchema.extend({ id: z.string().uuid("Invalid request reference.") });

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

  await withTransaction(async (conn) => {
    await run(
      `INSERT INTO hrdo_coe_requests
         (id, employee_id, employee_name, employee_email, employee_number, department,
          purpose, note, copy_type, deadline_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 3 DAY))`,
      [
        id,
        viewer.id,
        viewer.name,
        viewer.email,
        data.employeeNumber,
        viewer.department,
        data.purpose,
        data.note,
        data.copyType,
      ],
      conn,
    );
    await addHistory(conn, id, viewer, "submitted", "Certificate of Employment request submitted.");
  });

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

    // The original submission timestamp and deadline are deliberately preserved.
    await run(
      `UPDATE hrdo_coe_requests
       SET employee_name = ?, employee_number = ?, department = ?, purpose = ?, note = ?,
           copy_type = ?, correction_message = NULL, status = 'pending', updated_at = NOW()
       WHERE id = ?`,
      [
        viewer.name,
        data.employeeNumber,
        viewer.department,
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

  await withTransaction(async (conn) => {
    const row = await loadRow(data.id, conn, true);
    if (row.status !== "pending" && row.status !== "under_review") {
      throw new AppError("Only new or under-review requests can be verified.");
    }
    if (row.verified_at) {
      throw new AppError("This request has already been verified.");
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

  return loadRequest(data.id);
}

export async function startCoeProcessing(input: unknown): Promise<CoeRequest> {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const data = parseInput(idSchema, input);

  await withTransaction(async (conn) => {
    const row = await loadRow(data.id, conn, true);
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

  return loadRequest(data.id);
}

export async function requestCoeCorrection(input: unknown): Promise<CoeRequest> {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const data = parseInput(correctionSchema, input);

  await withTransaction(async (conn) => {
    const row = await loadRow(data.id, conn, true);
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

  return loadRequest(data.id);
}

export async function rejectCoeRequest(input: unknown): Promise<CoeRequest> {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const data = parseInput(rejectSchema, input);

  await withTransaction(async (conn) => {
    const row = await loadRow(data.id, conn, true);
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

  return loadRequest(data.id);
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
      "UPDATE hrdo_coe_requests SET finalized_at = NOW(), updated_at = NOW() WHERE id = ?",
      [data.id],
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
    }
  });

  return loadRequest(data.id);
}

export async function markCoeReady(input: unknown): Promise<CoeRequest> {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const data = parseInput(idSchema, input);

  await withTransaction(async (conn) => {
    const row = await loadRow(data.id, conn, true);
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

  return loadRequest(data.id);
}

export async function releaseCoeDocument(input: unknown): Promise<CoeRequest> {
  const viewer = await requireHrdoViewer();
  requireStaff(viewer);
  const data = parseInput(releaseSchema, input);

  await withTransaction(async (conn) => {
    const row = await loadRow(data.id, conn, true);
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
  });

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
