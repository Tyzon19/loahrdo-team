import type { RowDataPacket } from "mysql2/promise";
import type { CoeCopyType, CoeStatus } from "@/lib/hrdo";
import { canManageHrdoAccounts } from "@/lib/hrdo";
import { AppError } from "@/lib/errors";
import { all } from "@/server/db";
import { requireHrdoViewer } from "./auth";

interface SummaryRow extends RowDataPacket {
  total: number | string;
  open_count: number | string;
  due_soon: number | string;
  overdue: number | string;
  released: number | string;
  rejected: number | string;
  average_release_days: number | string | null;
}

interface MonthRow extends RowDataPacket {
  month: string;
  total: number | string;
}

interface StatusRow extends RowDataPacket {
  status: CoeStatus;
  total: number | string;
}

interface DepartmentRow extends RowDataPacket {
  department: string;
  total: number | string;
}

interface CopyRow extends RowDataPacket {
  copy_type: CoeCopyType;
  total: number | string;
}

function number(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function monthKeys(currentMonth: string) {
  const [year, month] = currentMonth.split("-").map(Number);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year!, month! - 12 + index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export async function getCoeAnalytics() {
  const viewer = await requireHrdoViewer();
  if (!canManageHrdoAccounts(viewer)) {
    throw new AppError("Only HRDO administrators can view COE analytics.");
  }

  const periodStart = "DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 11 MONTH), '%Y-%m-01')";
  const [currentRows, summaryRows, requestMonthRows, releaseMonthRows, statusRows, departmentRows, copyRows] =
    await Promise.all([
      all<Array<RowDataPacket & { current_month: string }>>(
        "SELECT DATE_FORMAT(NOW(), '%Y-%m') AS current_month",
      ),
      all<SummaryRow[]>(
        `SELECT COUNT(*) AS total,
                SUM(status IN ('pending','under_review','correction_requested','processing','awaiting_review','ready_for_pickup')) AS open_count,
                SUM(status IN ('pending','under_review','correction_requested','processing','awaiting_review') AND deadline_at > NOW() AND deadline_at <= DATE_ADD(NOW(), INTERVAL 24 HOUR)) AS due_soon,
                SUM(status IN ('pending','under_review','correction_requested','processing','awaiting_review') AND deadline_at <= NOW()) AS overdue,
                SUM(status = 'released') AS released,
                SUM(status = 'rejected') AS rejected,
                AVG(CASE WHEN status = 'released' AND released_at IS NOT NULL
                    THEN TIMESTAMPDIFF(HOUR, requested_at, released_at) / 24 END) AS average_release_days
         FROM hrdo_coe_requests`,
      ),
      all<MonthRow[]>(
        `SELECT DATE_FORMAT(requested_at, '%Y-%m') AS month, COUNT(*) AS total
         FROM hrdo_coe_requests
         WHERE requested_at >= ${periodStart}
         GROUP BY DATE_FORMAT(requested_at, '%Y-%m')
         ORDER BY month`,
      ),
      all<MonthRow[]>(
        `SELECT DATE_FORMAT(released_at, '%Y-%m') AS month, COUNT(*) AS total
         FROM hrdo_coe_requests
         WHERE released_at IS NOT NULL AND released_at >= ${periodStart}
         GROUP BY DATE_FORMAT(released_at, '%Y-%m')
         ORDER BY month`,
      ),
      all<StatusRow[]>(
        `SELECT status, COUNT(*) AS total
         FROM hrdo_coe_requests
         GROUP BY status
         ORDER BY total DESC`,
      ),
      all<DepartmentRow[]>(
        `SELECT COALESCE(NULLIF(TRIM(department), ''), 'Not specified') AS department,
                COUNT(*) AS total
         FROM hrdo_coe_requests
         WHERE requested_at >= ${periodStart}
         GROUP BY COALESCE(NULLIF(TRIM(department), ''), 'Not specified')
         ORDER BY total DESC, department ASC
         LIMIT 8`,
      ),
      all<CopyRow[]>(
        `SELECT copy_type, COUNT(*) AS total
         FROM hrdo_coe_requests
         WHERE requested_at >= ${periodStart}
         GROUP BY copy_type
         ORDER BY total DESC`,
      ),
    ]);

  const currentMonth = currentRows[0]?.current_month;
  const summary = summaryRows[0];
  if (!currentMonth || !summary) throw new AppError("COE analytics are temporarily unavailable.");
  const requestMonths = new Map(requestMonthRows.map((row) => [row.month, number(row.total)]));
  const releaseMonths = new Map(releaseMonthRows.map((row) => [row.month, number(row.total)]));

  return {
    summary: {
      total: number(summary.total),
      open: number(summary.open_count),
      dueSoon: number(summary.due_soon),
      overdue: number(summary.overdue),
      released: number(summary.released),
      rejected: number(summary.rejected),
      averageReleaseDays:
        summary.average_release_days === null ? null : Number(summary.average_release_days),
    },
    monthly: monthKeys(currentMonth).map((month) => ({
      month,
      requested: requestMonths.get(month) ?? 0,
      released: releaseMonths.get(month) ?? 0,
    })),
    statuses: statusRows.map((row) => ({ status: row.status, total: number(row.total) })),
    departments: departmentRows.map((row) => ({
      department: row.department,
      total: number(row.total),
    })),
    copyTypes: copyRows.map((row) => ({ copyType: row.copy_type, total: number(row.total) })),
  };
}
