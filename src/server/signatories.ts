import type { Role, StageKey } from "@/lib/types";
import {
  createAssistantAccountSchema,
  resetUserPasswordSchema,
  signatoryAssistantsSchema,
} from "@/lib/validation";
import { AppError, isDuplicateKey, parseInput } from "@/lib/errors";
import type { RowDataPacket } from "mysql2/promise";
import { randomBytes, randomUUID } from "node:crypto";
import { all, getPool, run, withTransaction } from "./db";
import { requireViewer } from "./auth";
import { loadAssistantNames, loadAssistantUserIds, loadUsers } from "./mappers";
import { allowedEmailDomains } from "./env";
import { emailDomainAllowed } from "@/lib/validation";
import { hashPassword } from "./password";

const ASSISTANT_ROLES: Role[] = ["assistant", "transport_staff", "guard", "driver"];

interface AssistantAccountRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  role: Role;
}

function requireAdmin(role: Role) {
  if (role !== "admin") {
    throw new AppError("Only administrators can manage alternate signatories.");
  }
}

export async function getSignatoryAssistants() {
  const viewer = await requireViewer();
  requireAdmin(viewer.role);
  const db = await getPool();
  const [names, userIds, users] = await Promise.all([
    loadAssistantNames(db),
    loadAssistantUserIds(db),
    loadUsers(db),
  ]);
  return {
    names,
    userIds,
    users: users.filter((user) => ASSISTANT_ROLES.includes(user.role)),
    resettableUsers: users.filter((user) => user.role !== "admin"),
  };
}

export async function saveSignatoryAssistants(input: unknown) {
  const viewer = await requireViewer();
  requireAdmin(viewer.role);
  const assistants = parseInput(signatoryAssistantsSchema, input);
  const stages: StageKey[] = ["review", "recommend", "approve"];

  await withTransaction(async (conn) => {
    const assignedUsers = new Set<string>();
    for (const stage of stages) {
      const assistant = assistants[stage];
      if (assistant.userId) {
        if (assignedUsers.has(assistant.userId)) {
          throw new AppError("Choose a different account for each alternate signatory.");
        }
        assignedUsers.add(assistant.userId);
        const rows = await all<AssistantAccountRow[]>(
          "SELECT id, name, role FROM users WHERE id = ? LIMIT 1",
          [assistant.userId],
          conn,
        );
        const account = rows[0];
        if (!account || !ASSISTANT_ROLES.includes(account.role)) {
          throw new AppError("Choose an eligible registered account for the alternate signatory.");
        }
        const stageRole: Record<StageKey, Role> = {
          review: "transport_head",
          recommend: "director",
          approve: "president",
        };
        if (account.role === stageRole[stage]) {
          throw new AppError("Choose an account other than the primary signatory.");
        }
        if (assistant.name !== account.name.trim()) {
          throw new AppError("The alternate signatory name must match the selected account name.");
        }
      } else if (assistant.name) {
        throw new AppError("Select a registered account for each alternate signatory.");
      }
      await run(
        `INSERT INTO signatory_assistants (stage_key, assistant_name, assistant_user_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           assistant_name = VALUES(assistant_name),
           assistant_user_id = VALUES(assistant_user_id)`,
        [stage, assistant.name, assistant.userId],
        conn,
      );
    }
  });

  return assistants;
}

export async function createAssistantAccount(input: unknown) {
  const viewer = await requireViewer();
  requireAdmin(viewer.role);
  const data = parseInput(createAssistantAccountSchema, input);
  if (!emailDomainAllowed(data.email, allowedEmailDomains())) {
    throw new AppError("Use an official institutional email address.");
  }

  const temporaryPassword = `${randomBytes(24).toString("base64url")}Aa1!`;
  try {
    await run(
      `INSERT INTO users
        (id, name, email, password_hash, role, department, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        randomUUID(),
        data.name,
        data.email,
        await hashPassword(temporaryPassword),
        "assistant",
        data.department,
      ],
    );
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError("An account with this email already exists.");
    }
    throw error;
  }

  return { email: data.email, temporaryPassword };
}

export async function resetUserPassword(input: unknown) {
  const viewer = await requireViewer();
  requireAdmin(viewer.role);
  const { userId } = parseInput(resetUserPasswordSchema, input);
  if (userId === viewer.id) {
    throw new AppError("Administrators cannot reset their own password here.");
  }

  const users = await all<AssistantAccountRow[]>(
    "SELECT id, name, role, email FROM users WHERE id = ? AND role <> 'admin' LIMIT 1",
    [userId],
  );
  const user = users[0];
  if (!user) throw new AppError("Choose a valid non-administrator account.");

  const temporaryPassword = `${randomBytes(24).toString("base64url")}Aa1!`;
  await run(
    `UPDATE users
     SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL
     WHERE id = ?`,
    [await hashPassword(temporaryPassword), userId],
  );
  await run("DELETE FROM sessions WHERE user_id = ?", [userId]);

  return { email: user.email, temporaryPassword };
}
