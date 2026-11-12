import type { RowDataPacket } from "mysql2/promise";
import { all, run } from "./db";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/**
 * An institutional account that exists in another LOA system (currently the
 * COE store). Signing in elsewhere links it to a plain requester profile.
 */
export interface LinkedAccount {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  department: string;
  must_change_password: number;
  is_locked: number;
  lock_minutes: number | null;
}

interface LinkedAccountRow extends RowDataPacket, LinkedAccount {}

export async function findLinkedAccount(email: string): Promise<LinkedAccount | null> {
  const rows = await all<LinkedAccountRow[]>(
    `SELECT id, name, email, password_hash, role, department, must_change_password,
            (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked,
            TIMESTAMPDIFF(MINUTE, NOW(), locked_until) AS lock_minutes
     FROM hrdo_users WHERE email = ? LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function clearLinkedLock(account: LinkedAccount) {
  await run("UPDATE hrdo_users SET failed_attempts = 0, locked_until = NULL WHERE id = ?", [
    account.id,
  ]);
}

export async function recordLinkedFailure(account: LinkedAccount) {
  await run(
    `UPDATE hrdo_users SET failed_attempts = failed_attempts + 1,
      locked_until = IF(failed_attempts + 1 >= ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), locked_until)
     WHERE id = ?`,
    [MAX_FAILED_ATTEMPTS, LOCK_MINUTES, account.id],
  );
}

/**
 * Gives a linked account a vehicle trip ticket profile. The profile is always a
 * requester: roles are per system, so the other system's powers never carry
 * over. An existing profile keeps the role it already has.
 */
export async function linkUserProfile(account: LinkedAccount): Promise<string> {
  const existing = await all<Array<RowDataPacket & { id: string }>>(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [account.email],
  );
  const row = existing[0];
  if (row) {
    await run(
      `UPDATE users
       SET password_hash = ?, failed_attempts = 0, locked_until = NULL,
           role = IF(role = 'department_head', 'requisitioner', role)
       WHERE id = ?`,
      [account.password_hash, row.id],
    );
    return row.id;
  }

  await run(
    `INSERT INTO users (id, name, email, password_hash, role, department, must_change_password)
     VALUES (?, ?, ?, ?, 'requisitioner', ?, ?)`,
    [
      account.id,
      account.name,
      account.email,
      account.password_hash,
      account.department || "General",
      account.must_change_password ? 1 : 0,
    ],
  );
  return account.id;
}
