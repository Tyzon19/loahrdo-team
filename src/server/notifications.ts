import type { EmailMessage } from "@/lib/types";
import { notificationIdSchema, requestIdSchema } from "@/lib/validation";
import { requireViewer } from "./auth";
import type { RowDataPacket } from "mysql2/promise";
import { all, run } from "./db";
import { AppError } from "@/lib/errors";
import { mapNotification, type NotificationDbRow } from "./mappers";

export async function listNotifications(): Promise<EmailMessage[]> {
  const viewer = await requireViewer();
  const rows = await all<NotificationDbRow[]>(
    `SELECT n.id, n.request_id, r.number AS request_number, n.to_user_id, n.to_name, n.to_email,
            n.subject, n.kind, n.stage, n.heading, n.body, n.cta_label, n.read_at, n.created_at
     FROM notifications n
     JOIN requests r ON r.id = n.request_id
     WHERE n.to_user_id = ?
     ORDER BY n.created_at DESC
     LIMIT 200`,
    [viewer.id],
  );
  return rows.map(mapNotification);
}

/** Returns the trip ticket photo as a data URL, only for the notification's own recipient. */
export async function notificationImage(input: unknown): Promise<string | null> {
  const viewer = await requireViewer();
  const parsed = notificationIdSchema.safeParse(input);
  if (!parsed.success) return null;
  const rows = await all<RowDataPacket[]>(
    `SELECT a.mime, a.image FROM notification_attachments a
     JOIN notifications n ON n.id = a.notification_id
     WHERE a.notification_id = ? AND n.to_user_id = ? LIMIT 1`,
    [parsed.data, viewer.id],
  );
  const row = rows[0];
  if (!row) return null;
  return `data:${String(row["mime"])};base64,${Buffer.from(row["image"] as Buffer).toString("base64")}`;
}

/** Returns only the approved ticket snapshot for its own requisitioner. */
export async function officialTripTicketImage(input: unknown): Promise<string | null> {
  const viewer = await requireViewer();
  if (viewer.role !== "requisitioner") {
    throw new AppError("Only requisitioners can view their official trip ticket.");
  }
  const parsed = requestIdSchema.safeParse(input);
  if (!parsed.success) return null;

  const rows = await all<RowDataPacket[]>(
    `SELECT a.mime, a.image
     FROM requests r
     JOIN notifications n
       ON n.request_id = r.id AND n.to_user_id = r.requisitioner_id AND n.kind = 'approved_requester'
     JOIN notification_attachments a ON a.notification_id = n.id
     WHERE r.id = ? AND r.requisitioner_id = ?
       AND r.status IN ('approved', 'dispatched', 'completed')
     ORDER BY n.created_at DESC
     LIMIT 1`,
    [parsed.data, viewer.id],
  );
  const row = rows[0];
  if (!row) return null;
  return `data:${String(row["mime"])};base64,${Buffer.from(row["image"] as Buffer).toString("base64")}`;
}

export async function markNotificationRead(input: unknown): Promise<{ ok: true }> {
  const viewer = await requireViewer();
  const parsed = notificationIdSchema.safeParse(input);
  if (!parsed.success) throw new AppError("We couldn't find that notification.");

  // The to_user_id predicate is the authorization check: one account can never
  // mark or read another account's inbox.
  const result = await run(
    "UPDATE notifications SET read_at = NOW() WHERE id = ? AND to_user_id = ?",
    [parsed.data, viewer.id],
  );
  if (result.affectedRows !== 1) throw new AppError("We couldn't find that notification.");
  return { ok: true };
}

export async function markApprovalNoticeRead(input: unknown): Promise<{ ok: true }> {
  const viewer = await requireViewer();
  if (viewer.role !== "requisitioner") {
    throw new AppError("Only requisitioners can mark trip approval notices as read.");
  }

  const parsed = requestIdSchema.safeParse(input);
  if (!parsed.success) throw new AppError("We couldn't find that trip ticket.");

  const requests = await all<RowDataPacket[]>(
    "SELECT id FROM requests WHERE id = ? AND requisitioner_id = ? LIMIT 1",
    [parsed.data, viewer.id],
  );
  if (!requests.length) throw new AppError("We couldn't find that trip ticket.");

  await run(
    `UPDATE notifications
     SET read_at = NOW()
     WHERE request_id = ? AND to_user_id = ? AND kind = 'approved_requester' AND read_at IS NULL`,
    [parsed.data, viewer.id],
  );
  return { ok: true };
}
