import { createHash } from "node:crypto";
import { run, type Db } from "./db";

const SESSION_TABLES = [
  "sessions",
  "permission_sessions",
  "attendance_sessions",
  "hrdo_sessions",
] as const;

export type RetainedSession = {
  table: (typeof SESSION_TABLES)[number];
  token: string | undefined;
};

/** Password changes keep only the session that performed the change. Resets keep none. */
export async function revokeAccountSessions(email: string, db: Db, keep?: RetainedSession) {
  for (const table of SESSION_TABLES) {
    const accounts = table === "hrdo_sessions" ? "hrdo_users" : "users";
    const retain = keep?.table === table && keep.token;
    await run(
      `DELETE FROM ${table} WHERE user_id IN (SELECT id FROM ${accounts} WHERE email = ?)${retain ? " AND token_hash <> ?" : ""}`,
      retain ? [email, createHash("sha256").update(retain).digest("hex")] : [email],
      db,
    );
  }
}
