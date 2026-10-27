import type { RowDataPacket } from "mysql2/promise";
import {
  isoApprovalTimestamp,
  readTicketVerificationToken,
  ticketDataDigest,
} from "@/lib/ticket-verification";
import { all, getPool } from "./db";
import { serverEnv } from "./env";
import { request } from "https";
interface VerificationRequestRow extends RowDataPacket {
  id: string;
  number: string;
  created_at: string;
  date_start: string;
  date_end: string;
  status: string;
  approved_at: string | null;
}
export async function verifyTicketToken(token: string): Promise<{
  requestNumber: string;
  requestDate: string;
  dateStart: string;
  dateEnd: string;
  destinations: string[];
} | null> {
  const claims = readTicketVerificationToken(token, serverEnv("TICKET_VERIFICATION_SECRET"));
  if (!claims) return null;

  const pool = await getPool();
  const requests = await all<VerificationRequestRow[]>(
    `SELECT r.id, r.number, r.created_at, r.date_start, r.date_end, r.status, r.approved_at
     FROM requests r
     WHERE r.id = ?
     LIMIT 1`,
    [claims.requestId],
    pool,
  );
  const request = requests[0];
  if (
    !request?.approved_at ||
    isoApprovalTimestamp(request.approved_at) !== claims.approvedAt ||
    !["approved", "dispatched", "completed"].includes(request.status)
  ) {
    return null;
  }
  const tickets = await all<RowDataPacket[]>(
    `SELECT a.notification_id
     FROM notifications n
     JOIN notification_attachments a ON a.notification_id = n.id
     WHERE n.request_id = ? AND n.kind = 'approved_requester'
     LIMIT 1`,
    [request.id],
    pool,
  );
  if (!tickets.length) return null;
  const destinations = await all<RowDataPacket[]>(
    `SELECT destination
     FROM request_destinations
     WHERE request_id = ?
     ORDER BY sort_order`,
    [request.id],
    pool,
  );
  const ticketData = {
    requestDate: request.created_at.slice(0, 10),
    dateStart: request.date_start,
    dateEnd: request.date_end,
    destinations: destinations.map((row) => String(row["destination"])),
  };
  if (ticketDataDigest(ticketData) !== claims.ticketDigest) return null;
  return {
    requestNumber: request.number,
    ...ticketData,
  };
}