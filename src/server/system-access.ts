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

export async function listSuperAdminOverview() {
  await requireSuperAdmin();

  const [
    userStats,
    employeeStats,
    transportStats,
    coeStats,
    permissionStats,
    recentUsers,
    recentAccess,
  ] = await Promise.all([
    all<Array<RowDataPacket & { total: number; active: number }>>(
      `SELECT COUNT(*) AS total,
                COALESCE(SUM(locked_until IS NULL OR locked_until <= NOW()), 0) AS active
         FROM users`,
    ),
    all<Array<RowDataPacket & { total: number }>>(
      "SELECT COUNT(*) AS total FROM hrdo_users WHERE role = 'employee'",
    ),
    all<Array<RowDataPacket & { pending: number; completed: number; rejected: number }>>(
      `SELECT
           COALESCE(SUM(status LIKE 'pending_%' OR status = 'returned'), 0) AS pending,
           COALESCE(SUM(status IN ('completed','approved','dispatched')), 0) AS completed,
           COALESCE(SUM(status = 'rejected'), 0) AS rejected
         FROM requests`,
    ),
    all<Array<RowDataPacket & { pending: number; completed: number; rejected: number }>>(
      `SELECT
           COALESCE(SUM(status IN ('pending','under_review','correction_requested','processing','awaiting_review','ready_for_pickup')), 0) AS pending,
           COALESCE(SUM(status = 'released'), 0) AS completed,
           COALESCE(SUM(status = 'rejected'), 0) AS rejected
         FROM hrdo_coe_requests`,
    ),
    all<Array<RowDataPacket & { pending: number; completed: number; rejected: number }>>(
      `SELECT
           COALESCE(SUM(status = 'pending_approval'), 0) AS pending,
           COALESCE(SUM(status = 'approved'), 0) AS completed,
           COALESCE(SUM(status = 'rejected'), 0) AS rejected
         FROM permission_slips`,
    ),
    all<SystemAccessRow[]>(
      `SELECT u.id, u.name, u.email, u.role, u.is_super_admin,
                EXISTS (
                  SELECT 1 FROM permission_slip_admins a WHERE a.user_id = u.id
                ) AS is_permission_admin
         FROM users u
         ORDER BY u.created_at DESC
         LIMIT 8`,
    ),
    all<
      Array<
        RowDataPacket & {
          actor_name: string;
          actor_email: string;
          target_email: string;
          module_key: string;
          role_key: string;
          action: string;
          happened_at: string;
        }
      >
    >(
      `SELECT actor_name, actor_email, target_email, module_key, role_key, action, happened_at
         FROM system_access_history
         ORDER BY happened_at DESC
         LIMIT 8`,
    ),
  ]);

  const transport = transportStats[0];
  const coe = coeStats[0];
  const permission = permissionStats[0];
  const pending =
    Number(transport?.pending ?? 0) + Number(coe?.pending ?? 0) + Number(permission?.pending ?? 0);
  const completed =
    Number(transport?.completed ?? 0) +
    Number(coe?.completed ?? 0) +
    Number(permission?.completed ?? 0);
  const rejected =
    Number(transport?.rejected ?? 0) +
    Number(coe?.rejected ?? 0) +
    Number(permission?.rejected ?? 0);

  return {
    totals: {
      employees: Number(employeeStats[0]?.total ?? 0),
      users: Number(userStats[0]?.total ?? 0),
      activeUsers: Number(userStats[0]?.active ?? 0),
      pending,
      completed,
      rejected,
    },
    modules: {
      transportation: {
        pending: Number(transport?.pending ?? 0),
        completed: Number(transport?.completed ?? 0),
        rejected: Number(transport?.rejected ?? 0),
      },
      coe: {
        pending: Number(coe?.pending ?? 0),
        completed: Number(coe?.completed ?? 0),
        rejected: Number(coe?.rejected ?? 0),
      },
      permissionSlip: {
        pending: Number(permission?.pending ?? 0),
        completed: Number(permission?.completed ?? 0),
        rejected: Number(permission?.rejected ?? 0),
      },
      lateAbsences: { pending: 0, completed: 0, rejected: 0 },
    },
    recentUsers: recentUsers.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      isSuperAdmin: Boolean(row.is_super_admin),
      isPermissionSlipAdmin: Boolean(row.is_permission_admin),
    })),
    recentAccess: recentAccess.map((row) => ({
      actorName: row.actor_name,
      actorEmail: row.actor_email,
      targetEmail: row.target_email,
      moduleKey: row.module_key,
      roleKey: row.role_key,
      action: row.action,
      happenedAt: row.happened_at,
    })),
  };
}

export async function listAdminOperationsOverview() {
  const current = await requireViewer();
  if (current.role !== "admin" && !current.isSuperAdmin) {
    throw new AppError("Only Admin / HR users can view operations overview.");
  }

  const [employees, transportRows, coeRows, permissionRows, late] = await Promise.all([
    all<Array<RowDataPacket & { total: number }>>("SELECT COUNT(*) AS total FROM hrdo_users"),
    all<
      Array<
        RowDataPacket & {
          total: number;
          pending: number;
          forApproval: number;
          approved: number;
          rejected: number;
          completed: number;
        }
      >
    >(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(status LIKE 'pending_%'), 0) AS pending,
         COALESCE(SUM(status = 'pending_approval'), 0) AS forApproval,
         COALESCE(SUM(status = 'approved'), 0) AS approved,
         COALESCE(SUM(status = 'rejected'), 0) AS rejected,
         COALESCE(SUM(status = 'completed'), 0) AS completed
       FROM requests`,
    ),
    all<
      Array<
        RowDataPacket & {
          total: number;
          pending: number;
          forApproval: number;
          approved: number;
          rejected: number;
          completed: number;
        }
      >
    >(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(status IN ('pending','under_review','processing','awaiting_review','ready_for_pickup')), 0) AS pending,
         COALESCE(SUM(status = 'awaiting_review'), 0) AS forApproval,
         COALESCE(SUM(status = 'released'), 0) AS approved,
         COALESCE(SUM(status = 'rejected'), 0) AS rejected,
         COALESCE(SUM(status = 'released'), 0) AS completed
       FROM hrdo_coe_requests`,
    ),
    all<
      Array<
        RowDataPacket & {
          total: number;
          pending: number;
          forApproval: number;
          approved: number;
          rejected: number;
          completed: number;
        }
      >
    >(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(status = 'pending_approval'), 0) AS pending,
         COALESCE(SUM(status = 'pending_approval'), 0) AS forApproval,
         COALESCE(SUM(status = 'approved'), 0) AS approved,
         COALESCE(SUM(status = 'rejected'), 0) AS rejected,
         COALESCE(SUM(status = 'approved'), 0) AS completed
       FROM permission_slips`,
    ),
    all<Array<RowDataPacket & { openFlags: number }>>(
      "SELECT COALESCE(SUM(status = 'OPEN'), 0) AS openFlags FROM leave_discrepancy_flags",
    ),
  ]);

  const moduleCounts = (
    row:
      | {
          total: number;
          pending: number;
          forApproval: number;
          approved: number;
          rejected: number;
          completed: number;
        }
      | undefined,
  ) => ({
    total: Number(row?.total ?? 0),
    pending: Number(row?.pending ?? 0),
    forApproval: Number(row?.forApproval ?? 0),
    approved: Number(row?.approved ?? 0),
    rejected: Number(row?.rejected ?? 0),
    completed: Number(row?.completed ?? 0),
  });

  return {
    employees: Number(employees[0]?.total ?? 0),
    totals: {
      transportation: moduleCounts(transportRows[0]),
      coe: moduleCounts(coeRows[0]),
      permissionSlip: moduleCounts(permissionRows[0]),
      lateAbsences: {
        total: Number(late[0]?.openFlags ?? 0),
        pending: Number(late[0]?.openFlags ?? 0),
        forApproval: 0,
        approved: 0,
        rejected: 0,
        completed: 0,
      },
    },
  };
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
