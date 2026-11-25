import { createHash, timingSafeEqual } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { AppError } from "@/lib/errors";
import { all, run, type Db } from "./db";

/** Return errors so failed-attempt updates commit before the caller throws. */
export async function consumeRecoveryCode(
  table: "registration_otps" | "hrdo_registration_otps",
  email: string,
  code: string,
  db: Db,
): Promise<AppError | null> {
  const rows = await all<
    Array<RowDataPacket & { code_hash: string; attempts: number; expired: number }>
  >(
    `SELECT code_hash, attempts, (expires_at <= NOW()) AS expired FROM ${table} WHERE email = ? FOR UPDATE`,
    [email],
    db,
  );
  const otp = rows[0];
  const invalid = new AppError("The recovery code is invalid or expired.");
  if (!otp || otp.expired || otp.attempts >= 5) return invalid;

  const expected = Buffer.from(otp.code_hash, "hex");
  const supplied = createHash("sha256").update(code).digest();
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    await run(`UPDATE ${table} SET attempts = attempts + 1 WHERE email = ?`, [email], db);
    return invalid;
  }
  await run(`DELETE FROM ${table} WHERE email = ?`, [email], db);
  return null;
}
