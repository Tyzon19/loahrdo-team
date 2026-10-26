import type { Role, StageKey } from "@/lib/types";
import {
  createAssistantAccountSchema,
  createMainSignatoryAccountSchema,
  mainSignatoriesSchema,
  resetUserPasswordSchema,
  signatoryAssistantsSchema,
} from "@/lib/validation";
import { AppError, isDuplicateKey, parseInput } from "@/lib/errors";
import type { RowDataPacket } from "mysql2/promise";
import { randomBytes, randomUUID } from "node:crypto";
import { all, getPool, run, withTransaction } from "./db";
import { requireViewer } from "./auth";
import {
  loadApproverNames,
  loadApproverUserIds,
  loadAssistantNames,
  loadAssistantUserIds,
  loadEffectiveApproverUserIds,
  loadUsers,
} from "./mappers";
import { allowedEmailDomains } from "./env";
import { emailDomainAllowed } from "@/lib/validation";
import { hashPassword } from "./password";

const ASSISTANT_ROLES: Role[] = ["assistant", "transport_staff", "guard", "driver"];
const MAIN_SIGNATORY_ELIGIBLE_ROLES: Role[] = [
  "transport_head",
  "director",
  "president",
  ...ASSISTANT_ROLES,
];
const STAGE_ROLES: Record<StageKey, Role> = {
  review: "transport_head",
  recommend: "director",
  approve: "president",
};

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
  const [names, alternateNames, alternateUserIds, mainUserIds, users] = await Promise.all([
    loadApproverNames(db),
    loadAssistantNames(db),
    loadAssistantUserIds(db),
    loadApproverUserIds(db),
    loadUsers(db),
  ]);
  return {
    names: alternateNames,
    userIds: alternateUserIds,
    users: users.filter((user) => ASSISTANT_ROLES.includes(user.role)),
    mainSignatoryNames: names,
    configuredMainSignatoryUserIds: mainUserIds,
    mainSignatoryUsers: users.filter((user) => MAIN_SIGNATORY_ELIGIBLE_ROLES.includes(user.role)),
    resettableUsers: users.filter((user) => user.role !== "admin"),
  };
}

export async function saveMainSignatories(input: unknown) {
  const viewer = await requireViewer();
  requireAdmin(viewer.role);
  const assignments = parseInput(mainSignatoriesSchema, input);
  const stages: StageKey[] = ["review", "recommend", "approve"];
  const selectedUserIds = stages
    .map((stage) => assignments[stage])
    .filter((userId): userId is string => Boolean(userId));

  if (new Set(selectedUserIds).size !== selectedUserIds.length) {
    throw new AppError("Choose a different account for each main signatory position.");
  }

  await withTransaction(async (conn) => {
    const assistantUserIds = await loadAssistantUserIds(conn);
    for (const stage of stages) {
      const userId = assignments[stage];
      if (!userId) continue;
      const assignedAsAlternateStage = stages.find(
        (candidate) => assistantUserIds[candidate] === userId,
      );
      if (assignedAsAlternateStage && assignedAsAlternateStage !== stage) {
        throw new AppError(
          "An account cannot be a main signatory and an alternate at different stages.",
        );
      }
    }

    if (selectedUserIds.length) {
      const users = await all<AssistantAccountRow[]>(
        `SELECT id, name, role FROM users WHERE id IN (?) FOR UPDATE`,
        [selectedUserIds],
        conn,
      );
      const usersById = new Map(users.map((user) => [user.id, user]));
      for (const userId of selectedUserIds) {
        const account = usersById.get(userId);
        if (!account || !MAIN_SIGNATORY_ELIGIBLE_ROLES.includes(account.role)) {
          throw new AppError("Choose an eligible registered account for each main signatory.");
        }
      }
    }

    await run("DELETE FROM main_signatory_assignments", [], conn);
    for (const stage of stages) {
      const userId = assignments[stage];
      if (!userId) continue;
      if (assistantUserIds[stage] === userId) {
        await run(
          `UPDATE signatory_assistants
           SET assistant_name = '', assistant_user_id = NULL
           WHERE stage_key = ?`,
          [stage],
          conn,
        );
      }
      await run(
        `INSERT INTO main_signatory_assignments (stage_key, user_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
        [stage, userId],
        conn,
      );
    }
  });

  return assignments;
}

export async function saveSignatoryAssistants(input: unknown) {
  const viewer = await requireViewer();
  requireAdmin(viewer.role);
  const assistants = parseInput(signatoryAssistantsSchema, input);
  const stages: StageKey[] = ["review", "recommend", "approve"];

  await withTransaction(async (conn) => {
    const assignedUsers = new Set<string>();
    const mainUserIds = await loadEffectiveApproverUserIds(conn);
    for (const stage of stages) {
      const assistant = assistants[stage];
      if (assistant.userId) {
        if (assignedUsers.has(assistant.userId)) {
          throw new AppError("Choose a different account for each alternate signatory.");
        }
        assignedUsers.add(assistant.userId);
        if (stages.some((candidate) => mainUserIds[candidate] === assistant.userId)) {
          throw new AppError("An assigned main signatory cannot also be an alternate signatory.");
        }
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

export async function createMainSignatoryAccount(input: unknown) {
  const viewer = await requireViewer();
  requireAdmin(viewer.role);
  const data = parseInput(createMainSignatoryAccountSchema, input);
  if (!emailDomainAllowed(data.email, allowedEmailDomains())) {
    throw new AppError("Use an official institutional email address.");
  }

  const role = STAGE_ROLES[data.stage];
  const id = randomUUID();
  const temporaryPassword = `${randomBytes(24).toString("base64url")}Aa1!`;
  const passwordHash = await hashPassword(temporaryPassword);
  try {
    await withTransaction(async (conn) => {
      await run(
        `INSERT INTO users
          (id, name, email, password_hash, role, department, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [id, data.name, data.email, passwordHash, role, data.department],
        conn,
      );
      await run(
        `INSERT INTO main_signatory_assignments (stage_key, user_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
        [data.stage, id],
        conn,
      );
      await run(
        `UPDATE signatory_assistants
         SET assistant_name = '', assistant_user_id = NULL
         WHERE stage_key = ?`,
        [data.stage],
        conn,
      );
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError("An account with this email already exists.");
    }
    throw error;
  }

  return { id, name: data.name, email: data.email, role, temporaryPassword };
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
