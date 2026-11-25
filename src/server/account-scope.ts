import type { RowDataPacket } from "mysql2/promise";
import { AppError } from "@/lib/errors";
import { all } from "./db";

export async function attendanceOnlyUser(userId: string) {
  const rows = await all<Array<RowDataPacket & { attendance_only: number }>>(
    "SELECT EXISTS(SELECT 1 FROM attendance_only_accounts WHERE user_id = ?) AS attendance_only",
    [userId],
  );
  return Boolean(rows[0]?.attendance_only);
}
export async function attendanceOnlyEmail(email: string) {
  const rows = await all<Array<RowDataPacket & { attendance_only: number }>>(
    `SELECT EXISTS(SELECT 1 FROM attendance_only_accounts a JOIN users u ON u.id = a.user_id
      WHERE u.email = ?) AS attendance_only`,
    [email.trim().toLowerCase()],
  );
  return Boolean(rows[0]?.attendance_only);
}
export async function assertOtherSystemUser(userId: string) {
  if (await attendanceOnlyUser(userId))
    throw new AppError("This account is limited to Leave & Attendance. Sign in at /leaves/login.");
}
export async function assertOtherSystemEmail(email: string) {
  if (await attendanceOnlyEmail(email))
    throw new AppError("This account is limited to Leave & Attendance. Sign in at /leaves/login.");
}
