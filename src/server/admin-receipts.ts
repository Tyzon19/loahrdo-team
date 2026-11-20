import type { RowDataPacket } from "mysql2/promise";
import JSZip from "jszip";
import { AppError, parseInput } from "@/lib/errors";
import {
  adminReceiptListSchema,
  adminReceiptPreviewSchema,
  adminReceiptBulkDownloadSchema,
  type AdminReceiptListResult,
  type AdminReceiptPreview,
  type AdminReceiptSystem,
} from "@/lib/admin-receipts";
import { canAccessAdminPortal } from "@/lib/access";
import { COE_DOCUMENT_MIMES } from "@/lib/hrdo";
import { all } from "./db";
import { requireViewer } from "./auth";
import { getPermissionSlip } from "./permission";

const PAGE_SIZE = 24;

interface ReceiptRow extends RowDataPacket {
  id: string;
  system: AdminReceiptSystem;
  reference: string;
  person_name: string;
  department: string;
  status: string;
  receipt_at_ms: number | string;
  file_name: string | null;
}

interface ReceiptCountRow extends RowDataPacket {
  system: AdminReceiptSystem;
  total: number;
}

interface VehicleReceiptFileRow extends RowDataPacket {
  number: string;
  mime: string;
  image: Buffer;
}

interface CoeReceiptFileRow extends RowDataPacket {
  status: string;
  file_name: string;
  mime: string;
  content: Buffer;
}

interface PermissionReceiptFileRow extends RowDataPacket {
  status: string;
  receipt_image: Buffer | null;
}

async function requireAdminPortalAccess() {
  const viewer = await requireViewer();
  if (!canAccessAdminPortal(viewer.role, viewer.isSuperAdmin)) {
    throw new AppError("Only Admins can view system receipts.");
  }
}

function dateConditions(column: string, dateFrom?: string, dateTo?: string) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (dateFrom) {
    conditions.push(`${column} >= CONCAT(?, ' 00:00:00')`);
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push(`${column} < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY)`);
    params.push(dateTo);
  }
  return { sql: conditions.length ? ` AND ${conditions.join(" AND ")}` : "", params };
}

function receiptQuery(
  system: AdminReceiptSystem,
  dateFrom?: string,
  dateTo?: string,
): { sql: string; params: unknown[] } {
  if (system === "vehicle_trip_ticket") {
    const date = dateConditions("n.created_at", dateFrom, dateTo);
    return {
      sql: `SELECT r.id, 'vehicle_trip_ticket' AS system, r.number AS reference,
                   r.requisitioner_name AS person_name, r.department, r.status,
                   UNIX_TIMESTAMP(MAX(n.created_at)) * 1000 AS receipt_at_ms,
                   NULL AS file_name
            FROM requests r
            JOIN notifications n
              ON n.request_id = r.id
             AND n.to_user_id = r.requisitioner_id
             AND n.kind = 'approved_requester'
            JOIN notification_attachments a ON a.notification_id = n.id
            WHERE r.status IN ('approved', 'dispatched', 'completed')${date.sql}
            GROUP BY r.id, r.number, r.requisitioner_name, r.department, r.status`,
      params: date.params,
    };
  }

  if (system === "coe") {
    const date = dateConditions("d.uploaded_at", dateFrom, dateTo);
    return {
      sql: `SELECT c.id, 'coe' AS system,
                   CONCAT('COE-', UPPER(LEFT(c.id, 8))) AS reference,
                   c.employee_name AS person_name, c.department, c.status,
                   UNIX_TIMESTAMP(d.uploaded_at) * 1000 AS receipt_at_ms,
                   d.file_name
            FROM hrdo_coe_requests c
            JOIN hrdo_coe_documents d ON d.request_id = c.id
            WHERE c.status IN ('ready_for_pickup', 'released')${date.sql}`,
      params: date.params,
    };
  }

  const date = dateConditions("p.approved_at", dateFrom, dateTo);
  return {
    sql: `SELECT p.id, 'permission_slip' AS system,
                 CONCAT('PS-', UPPER(LEFT(p.id, 8))) AS reference,
                 p.employee_name AS person_name, p.department, p.status,
                 UNIX_TIMESTAMP(p.approved_at) * 1000 AS receipt_at_ms,
                 NULL AS file_name
          FROM permission_slips p
          WHERE p.status = 'approved' AND p.approved_at IS NOT NULL${date.sql}`,
    params: date.params,
  };
}

export async function listAdminReceipts(input: unknown): Promise<AdminReceiptListResult> {
  await requireAdminPortalAccess();
  const filters = parseInput(adminReceiptListSchema, input);
  const systems: AdminReceiptSystem[] =
    filters.system === "all" ? ["vehicle_trip_ticket", "coe", "permission_slip"] : [filters.system];
  const queries = systems.map((system) => receiptQuery(system, filters.dateFrom, filters.dateTo));
  const sql = queries.map((query) => query.sql).join(" UNION ALL ");
  const params = queries.flatMap((query) => query.params);
  let searchSql = "";
  if (filters.q) {
    searchSql = ` WHERE person_name LIKE ? OR department LIKE ? OR reference LIKE ?`;
    const term = `%${filters.q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    params.push(term, term, term);
  }
  const countRows = await all<ReceiptCountRow[]>(
    `SELECT system, COUNT(*) AS total
     FROM (${sql}) AS receipts${searchSql}
     GROUP BY system`,
    [...params],
  );
  const counts: AdminReceiptListResult["counts"] = {
    all: 0,
    vehicle_trip_ticket: 0,
    coe: 0,
    permission_slip: 0,
  };
  for (const row of countRows) {
    const total = Number(row.total);
    counts[row.system] = total;
    counts.all += total;
  }
  const offset = filters.page * PAGE_SIZE;
  const rows = await all<ReceiptRow[]>(
    `SELECT * FROM (${sql}) AS receipts${searchSql}
     ORDER BY receipt_at_ms DESC, system ASC, id ASC
     LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE + 1, offset],
  );
  const items = rows.slice(0, PAGE_SIZE).map((row) => {
    const receiptDate = new Date(Number(row.receipt_at_ms));
    if (Number.isNaN(receiptDate.getTime())) {
      throw new AppError("A receipt has an invalid date and could not be displayed.");
    }
    return {
      id: row.id,
      system: row.system,
      reference: row.reference,
      personName: row.person_name,
      department: row.department,
      status: row.status,
      receiptAt: receiptDate.toISOString(),
      ...(row.file_name ? { fileName: row.file_name } : {}),
    };
  });
  return {
    items,
    page: filters.page,
    pageSize: PAGE_SIZE,
    hasMore: rows.length > PAGE_SIZE,
    counts,
  };
}

export async function getAdminReceiptPreview(input: unknown): Promise<AdminReceiptPreview> {
  await requireAdminPortalAccess();
  const data = parseInput(adminReceiptPreviewSchema, input);

  if (data.system === "vehicle_trip_ticket") {
    const rows = await all<VehicleReceiptFileRow[]>(
      `SELECT r.number, a.mime, a.image
       FROM requests r
       JOIN notifications n
         ON n.request_id = r.id
        AND n.to_user_id = r.requisitioner_id
        AND n.kind = 'approved_requester'
       JOIN notification_attachments a ON a.notification_id = n.id
       WHERE r.id = ? AND r.status IN ('approved', 'dispatched', 'completed')
       ORDER BY n.created_at DESC
       LIMIT 1`,
      [data.id],
    );
    const row = rows[0];
    if (!row) throw new AppError("Receipt not found.");
    if (row.mime !== "image/png" && row.mime !== "image/jpeg") {
      throw new AppError("This trip ticket image has an unsupported file type.");
    }
    return {
      system: data.system,
      fileName: `${row.number}-trip-ticket.${row.mime === "image/png" ? "png" : "jpg"}`,
      mime: row.mime,
      base64: Buffer.from(row.image).toString("base64"),
    };
  }

  if (data.system === "coe") {
    const rows = await all<CoeReceiptFileRow[]>(
      `SELECT c.status, d.file_name, d.mime, d.content
       FROM hrdo_coe_requests c
       JOIN hrdo_coe_documents d ON d.request_id = c.id
       WHERE c.id = ? AND c.status IN ('ready_for_pickup', 'released')
       LIMIT 1`,
      [data.id],
    );
    const row = rows[0];
    if (!row) throw new AppError("Receipt not found.");
    if (row.mime !== COE_DOCUMENT_MIMES.pdf && row.mime !== COE_DOCUMENT_MIMES.docx) {
      throw new AppError("This COE document has an unsupported file type.");
    }
    return {
      system: data.system,
      fileName: row.file_name,
      mime: row.mime,
      base64: Buffer.from(row.content).toString("base64"),
    };
  }

  const slip = await getPermissionSlip(data.id);
  if (!slip || slip.status !== "approved") throw new AppError("Receipt not found.");
  const rows = await all<PermissionReceiptFileRow[]>(
    "SELECT status, receipt_image FROM permission_slips WHERE id = ? AND status = 'approved'",
    [data.id],
  );
  const row = rows[0];
  return {
    system: data.system,
    slip,
    ...(row?.receipt_image
      ? { receiptImage: Buffer.from(row.receipt_image).toString("base64") }
      : {}),
  };
}

function safeFileName(value: string) {
  return (
    value
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "receipt"
  );
}

export async function bulkDownloadAdminReceipts(input: unknown) {
  await requireAdminPortalAccess();
  const data = parseInput(adminReceiptBulkDownloadSchema, input);
  const zip = new JSZip();

  for (const receipt of data.receipts) {
    const preview = await getAdminReceiptPreview(receipt);
    const folder =
      preview.system === "vehicle_trip_ticket"
        ? "Vehicle-Trip-Tickets"
        : preview.system === "coe"
          ? "Certificates-of-Employment"
          : "Permission-Slips";

    if (preview.system === "permission_slip") {
      if (!preview.receiptImage) {
        throw new AppError(
          `The saved PNG receipt is missing for ${preview.slip.employeeName}. Open and archive it again.`,
        );
      }
      const fileName = `PS-${safeFileName(preview.slip.id.slice(0, 8).toUpperCase())}.png`;
      zip.folder(folder)?.file(fileName, Buffer.from(preview.receiptImage, "base64"));
      continue;
    }

    zip.folder(folder)?.file(preview.fileName, Buffer.from(preview.base64, "base64"));
  }

  const bytes = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
  return {
    fileName: `receipts-${new Date().toISOString().slice(0, 10)}.zip`,
    base64: bytes,
  };
}
