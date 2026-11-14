import { getRequestIP } from "@tanstack/react-start/server";
import { analyticsPathSchema, tripArchiveFilterSchema } from "@/lib/validation";
import { AppError, isMissingTableError, parseInput } from "@/lib/errors";
import type { RowDataPacket } from "mysql2/promise";
import { aggregateDestinationTrips } from "@/lib/destination-analytics";
import { all, likePattern, run } from "./db";
import { requireViewer } from "./auth";
import { canViewSiteAnalytics } from "@/lib/access";

const recent = new Map<string, number>();

export async function recordPageView(input: unknown): Promise<{ recorded: boolean }> {
  const parsed = analyticsPathSchema.safeParse(input);
  if (!parsed.success) return { recorded: false };

  const key = `${getRequestIP() ?? "unknown"}:${parsed.data}`;
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < 30_000) return { recorded: false };
  recent.set(key, now);
  if (recent.size > 2000) recent.clear();

  try {
    await run("INSERT INTO analytics_pageviews (path) VALUES (?)", [parsed.data]);
    return { recorded: true };
  } catch (error) {
    if (isMissingTableError(error)) {
      return { recorded: false };
    }
    throw error;
  }
}

const ARCHIVE_PAGE_SIZE = 20;

interface TripArchiveRow extends RowDataPacket {
  id: string;
  number: string;
  requisitioner_name: string;
  department: string;
  destinations: string | null;
  date_start: string;
  date_end: string;
  passengers: number;
  status: "approved" | "dispatched" | "completed";
  vehicle_type: string | null;
  plate_no: string | null;
  driver_name: string | null;
}

interface CountRow extends RowDataPacket {
  total: number;
  completed: number;
  dispatched: number;
  approved: number;
}

export async function getTripArchive(input: unknown) {
  const viewer = await requireViewer();
  if (!canViewSiteAnalytics(viewer.role, viewer.isSuperAdmin)) {
    throw new AppError("Only administrators can view trip analytics.");
  }

  const filter = parseInput(tripArchiveFilterSchema, input ?? {});
  const page = filter.page ?? 0;
  const where = ["r.status IN ('approved', 'dispatched', 'completed')"];
  const params: unknown[] = [];
  if (filter.from) {
    where.push("r.date_start >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("r.date_start <= ?");
    params.push(filter.to);
  }
  if (filter.q) {
    const like = likePattern(filter.q);
    where.push(`(
      r.number LIKE ? OR r.requisitioner_name LIKE ? OR r.department LIKE ?
      OR r.purpose LIKE ? OR r.vehicle_type LIKE ? OR r.plate_no LIKE ?
      OR dr.driver_name LIKE ?
      OR EXISTS (
        SELECT 1 FROM request_destinations search_destination
        WHERE search_destination.request_id = r.id AND search_destination.destination LIKE ?
      )
    )`);
    params.push(like, like, like, like, like, like, like, like);
  }
  const whereSql = where.join(" AND ");

  const countRows = await all<CountRow[]>(
    `SELECT COUNT(*) AS total,
       COALESCE(SUM(r.status = 'completed'), 0) AS completed,
       COALESCE(SUM(r.status = 'dispatched'), 0) AS dispatched,
       COALESCE(SUM(r.status = 'approved'), 0) AS approved
     FROM requests r LEFT JOIN dispatch_records dr ON dr.request_id = r.id
     WHERE ${whereSql}`,
    params,
  );
  const archiveRows = await all<TripArchiveRow[]>(
    `SELECT r.id, r.number, r.requisitioner_name, r.department,
       (SELECT GROUP_CONCAT(d.destination ORDER BY d.sort_order SEPARATOR '; ')
        FROM request_destinations d WHERE d.request_id = r.id) AS destinations,
       r.date_start, r.date_end, r.passengers, r.status, r.vehicle_type, r.plate_no,
       dr.driver_name
     FROM requests r LEFT JOIN dispatch_records dr ON dr.request_id = r.id
     WHERE ${whereSql}
     ORDER BY r.date_start DESC, r.submitted_at DESC
     LIMIT ? OFFSET ?`,
    [...params, ARCHIVE_PAGE_SIZE, page * ARCHIVE_PAGE_SIZE],
  );
  const monthlyRows = await all<RowDataPacket[]>(
    `SELECT DATE_FORMAT(r.date_start, '%Y-%m') AS month, COUNT(*) AS trips
     FROM requests r LEFT JOIN dispatch_records dr ON dr.request_id = r.id
     WHERE ${whereSql}
     GROUP BY DATE_FORMAT(r.date_start, '%Y-%m')
     ORDER BY month DESC
     LIMIT 12`,
    params,
  );
  const destinationRows = await all<RowDataPacket[]>(
    `SELECT r.id AS request_id, d.destination
     FROM requests r
     JOIN request_destinations d ON d.request_id = r.id
     LEFT JOIN dispatch_records dr ON dr.request_id = r.id
     WHERE ${whereSql}
     ORDER BY r.submitted_at DESC`,
    params,
  );

  const counts = countRows[0];
  return {
    total: Number(counts?.total ?? 0),
    page,
    pageSize: ARCHIVE_PAGE_SIZE,
    summary: {
      tickets: Number(counts?.total ?? 0),
      completedTrips: Number(counts?.completed ?? 0),
      dispatched: Number(counts?.dispatched ?? 0),
      approved: Number(counts?.approved ?? 0),
    },
    monthlyTrips: monthlyRows.map((row) => ({
      month: String(row["month"]),
      trips: Number(row["trips"]),
    })),
    destinations: aggregateDestinationTrips(
      destinationRows.map((row) => ({
        requestId: String(row["request_id"]),
        destination: String(row["destination"]),
      })),
    ),
    rows: archiveRows.map((row) => ({
      id: row.id,
      number: row.number,
      requisitionerName: row.requisitioner_name,
      department: row.department,
      destinations: row.destinations ?? "",
      dateStart: row.date_start,
      dateEnd: row.date_end,
      passengers: Number(row.passengers),
      status: row.status,
      vehicle: [row.vehicle_type, row.plate_no].filter(Boolean).join(" · "),
      driver: row.driver_name ?? "",
    })),
  };
}
