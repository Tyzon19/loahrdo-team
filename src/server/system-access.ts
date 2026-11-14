import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { AppError, parseInput } from "@/lib/errors";
import { all, run, withTransaction } from "./db";
import { requireViewer } from "./auth";

const assignmentSchema = z.object({
  userId: z.string().uuid(),
  system: z.enum(["super_admin", "permission_slip_admin"]),
  enabled: z.boolean(),
});

interface SystemAccessRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  role: string;
  is_super_admin: number;
  is_permission_admin: number;
}

async function requireSuperAdmin() {
  const current = await requireViewer();
  if (!current.isSuperAdmin) {
    throw new AppError("Only a Super Admin can manage system access.");
  }
  return current;
}

export async function listSystemAccessUsers() {
  await requireSuperAdmin();
  const rows = await all<SystemAccessRow[]>(
    `SELECT u.id, u.name, u.email, u.role, u.is_super_admin,
            EXISTS (
              SELECT 1 FROM permission_slip_admins a WHERE a.user_id = u.id
            ) AS is_permission_admin
     FROM users u
     ORDER BY u.name ASC, u.email ASC`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isSuperAdmin: Boolean(row.is_super_admin),
    isPermissionSlipAdmin: Boolean(row.is_permission_admin),
  }));
}

export async function setSystemAccessAssignment(input: unknown) {
  const actor = await requireSuperAdmin();
  const data = parseInput(assignmentSchema, input);
  if (data.system === "super_admin" && data.userId === actor.id && !data.enabled) {
    throw new AppError("Ask another Super Admin to remove your access.");
  }

  return withTransaction(async (conn) => {
    const targetRows = await all<Array<RowDataPacket & { id: string; email: string }>>(
      "SELECT id, email FROM users WHERE id = ? FOR UPDATE",
      [data.userId],
      conn,
    );
    const target = targetRows[0];
    if (!target) throw new AppError("Choose a valid system account.");

    let changed = false;
    if (data.system === "super_admin") {
      const currentAdmins = await all<Array<RowDataPacket & { id: string }>>(
        "SELECT id FROM users WHERE is_super_admin = 1 FOR UPDATE",
        [],
        conn,
      );
      const currentlyEnabled = currentAdmins.some((row) => row.id === data.userId);
      if (currentlyEnabled !== data.enabled && !data.enabled && currentAdmins.length <= 1) {
        throw new AppError("The system must always have at least one Super Admin.");
      }
      if (currentlyEnabled !== data.enabled) {
        await run(
          "UPDATE users SET is_super_admin = ? WHERE id = ?",
          [data.enabled ? 1 : 0, data.userId],
          conn,
        );
        changed = true;
      }
    } else {
      const currentAssignments = await all<Array<RowDataPacket & { user_id: string }>>(
        "SELECT user_id FROM permission_slip_admins WHERE user_id = ? FOR UPDATE",
        [data.userId],
        conn,
      );
      const currentlyEnabled = currentAssignments.length > 0;
      if (currentlyEnabled !== data.enabled) {
        if (data.enabled) {
          await run(
            "INSERT INTO permission_slip_admins (user_id, assigned_by) VALUES (?, ?)",
            [data.userId, actor.id],
            conn,
          );
        } else {
          await run("DELETE FROM permission_slip_admins WHERE user_id = ?", [data.userId], conn);
        }
        changed = true;
      }
    }

    if (changed) {
      await run(
        `INSERT INTO system_access_history
          (id, actor_id, actor_name, actor_email, target_id, target_email,
           module_key, role_key, action)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          actor.id,
          actor.name,
          actor.email,
          data.userId,
          target.email,
          data.system === "super_admin" ? "global" : "permission_slips",
          data.system === "super_admin" ? "super_admin" : "admin",
          data.enabled ? "granted" : "revoked",
        ],
        conn,
      );
    }

    return { system: data.system, enabled: data.enabled };
  });
}
