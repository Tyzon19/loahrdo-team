import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { all, getPool, run } from "@/server/db";
import { changePassword, requireViewer, resetPasswordWithRecoveryCode } from "@/server/auth";
import {
  hrdoChangePassword,
  requireHrdoViewer,
  resetHrdoPasswordWithRecoveryCode,
} from "@/server/hrdo/auth";
import { permissionChangePassword, requirePermissionViewer } from "@/server/permission/auth";
import { changeAttendancePassword } from "@/server/attendance-auth";
import { requireAttendanceEmployee } from "@/server/attendance";
import { resetUserPassword } from "@/server/signatories";
import { resetHrdoProcessorPassword } from "@/server/hrdo/admin";
import { submitPermissionSlip } from "@/server/permission";
import { submitCoeRequest } from "@/server/hrdo/coe";
import { coeProcessingDeadline } from "@/lib/hrdo";
import { sendPermissionSlipEmail } from "@/server/gmail";
import { hashPassword } from "@/server/password";

vi.mock("@tanstack/react-start/server", () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  getRequestHeader: vi.fn(),
  getRequestIP: vi.fn(),
}));
vi.mock("@/server/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/env")>()),
  serverEnv: (key: string) => {
    const value = process.env[key];
    if (value === undefined) throw new Error(`Missing ${key}`);
    return value;
  },
}));
vi.mock("@/server/gmail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/gmail")>()),
  sendTemporaryPasswordEmail: vi.fn().mockResolvedValue({ sent: true }),
  sendPermissionSlipEmail: vi.fn().mockResolvedValue({ sent: true, delivered: 1, failed: 0 }),
}));

const safe =
  process.env["ATTENDANCE_TEST_DB_SAFE"] === "1" &&
  /^loa_attendance_test_[a-f0-9]{16}$/.test(process.env["DB_NAME"] ?? "");
const password = "OriginalPassword!2026";
const newPassword = "ReplacementPassword!2026";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const portals = [
  { table: "sessions", cookie: "loa_session", guard: requireViewer, change: changePassword },
  {
    table: "hrdo_sessions",
    cookie: "loa_hrdo_session",
    guard: requireHrdoViewer,
    change: hrdoChangePassword,
  },
  {
    table: "permission_sessions",
    cookie: "loa_permission_session",
    guard: requirePermissionViewer,
    change: permissionChangePassword,
  },
  {
    table: "attendance_sessions",
    cookie: "loa_attendance_session",
    guard: requireAttendanceEmployee,
    change: (input: { currentPassword: string; newPassword: string }) =>
      changeAttendancePassword({ ...input, confirmPassword: input.newPassword }),
  },
] as const;
const recoveries = [
  { table: "registration_otps", reset: resetPasswordWithRecoveryCode },
  { table: "hrdo_registration_otps", reset: resetHrdoPasswordWithRecoveryCode },
] as const;
let cookies: Record<string, string>;

describe.skipIf(!safe)("cross-system credential security against isolated MySQL", () => {
  beforeAll(async () => {
    const rows = await all("SELECT DATABASE() AS name");
    if (rows[0]?.["name"] !== process.env["DB_NAME"]) throw new Error("Unsafe test database");
  });
  beforeEach(() => {
    vi.clearAllMocks();
    cookies = {};
    vi.mocked(getCookie).mockImplementation((name) => cookies[name]);
    vi.mocked(setCookie).mockImplementation((name, value) => {
      cookies[name] = value;
    });
    vi.mocked(deleteCookie).mockImplementation((name) => {
      delete cookies[name];
    });
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    await (await getPool()).end();
    delete (globalThis as { __loaDbPoolPromise?: unknown }).__loaDbPoolPromise;
  });

  async function account(mustChange = false) {
    const id = randomUUID(),
      email = `security.${id}@lyceumalabang.edu.ph`;
    const passwordHash = await hashPassword(password);
    await run(
      `INSERT INTO users (id,name,email,password_hash,role,department,profile_complete,must_change_password)
      VALUES (?, 'Security Fixture', ?, ?, 'requisitioner', 'College', 1, ?)`,
      [id, email, passwordHash, Number(mustChange)],
    );
    await run(
      `INSERT INTO hrdo_users (id,name,email,password_hash,role,department,must_change_password)
      VALUES (?, 'Security Fixture', ?, ?, 'employee', 'College', ?)`,
      [id, email, passwordHash, Number(mustChange)],
    );
    for (const portal of portals) {
      const token = randomBytes(32).toString("base64url");
      for (const value of [token, token.toUpperCase()]) {
        await run(
          `INSERT INTO ${portal.table} (id,user_id,token_hash,expires_at)
          VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 8 HOUR))`,
          [randomUUID(), id, hash(value)],
        );
      }
      cookies[portal.cookie] = token;
    }
    return { id, email, passwordHash };
  }

  async function sessionCounts(id: string) {
    return Promise.all(
      portals.map(async ({ table }) => {
        const rows = await all(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, [id]);
        return Number(rows[0]?.["n"]);
      }),
    );
  }

  async function recovery(
    table: string,
    user: Awaited<ReturnType<typeof account>>,
    expired = false,
  ) {
    await run(
      `INSERT INTO ${table} (email,name,department,password_hash,code_hash,send_nonce,last_sent_at,expires_at)
      VALUES (?, 'Security Fixture', 'College', ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [user.email, user.passwordHash, hash("123456"), randomUUID(), expired ? -1 : 10],
    );
  }

  it.each(portals)(
    "$table blocks unfinished setup but permits password change and keeps only its active session",
    async (portal) => {
      const user = await account(true);
      await expect(portal.guard()).rejects.toThrow("account setup");
      await portal.change({ currentPassword: password, newPassword });
      expect(await sessionCounts(user.id)).toEqual(
        portals.map((p) => Number(p.table === portal.table)),
      );
      await expect(portal.guard()).resolves.toBeTruthy();
    },
  );

  it.each(recoveries)(
    "$table consumes a recovery code once across simultaneous resets and revokes every module",
    async ({ table, reset }) => {
      const user = await account();
      await recovery(table, user);
      const results = await Promise.allSettled([
        reset({ email: user.email, code: "123456", newPassword }),
        reset({ email: user.email, code: "123456", newPassword: "AnotherPassword!2026" }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(await sessionCounts(user.id)).toEqual([0, 0, 0, 0]);
    },
  );

  it.each(recoveries)("$table expires codes using the database clock", async ({ table, reset }) => {
    const user = await account();
    await recovery(table, user, true);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() - 8 * 3600_000);
    await expect(reset({ email: user.email, code: "123456", newPassword })).rejects.toThrow(
      "invalid or expired",
    );
    expect(await sessionCounts(user.id)).toEqual([2, 2, 2, 2]);
  });

  it.each(recoveries)(
    "$table commits failed attempts and refuses the correct code after five failures",
    async ({ table, reset }) => {
      const user = await account();
      await recovery(table, user);
      for (let attempt = 0; attempt < 5; attempt++) {
        await expect(reset({ email: user.email, code: "000000", newPassword })).rejects.toThrow(
          "invalid or expired",
        );
      }
      const rows = await all(`SELECT attempts FROM ${table} WHERE email = ?`, [user.email]);
      expect(Number(rows[0]?.["attempts"])).toBe(5);
      await expect(reset({ email: user.email, code: "123456", newPassword })).rejects.toThrow(
        "invalid or expired",
      );
    },
  );

  it.each(["main", "hrdo"])(
    "%s administrator reset revokes every target session",
    async (system) => {
      const target = await account();
      const actor = await account();
      await run("UPDATE users SET role = 'admin', is_super_admin = 1 WHERE id = ?", [actor.id]);
      if (system === "hrdo")
        await run("UPDATE hrdo_users SET role = 'hrdo_staff' WHERE id = ?", [target.id]);
      await (system === "main" ? resetUserPassword : resetHrdoProcessorPassword)({
        userId: target.id,
      });
      expect(await sessionCounts(target.id)).toEqual([0, 0, 0, 0]);
    },
  );

  it("rolls back Permission Slip submission if its history cannot be saved", async () => {
    const employee = await account();
    const approver = randomUUID();
    await run(
      "INSERT INTO users (id,name,email,password_hash,role) VALUES (?, 'Approver', ?, 'fixture', 'requisitioner')",
      [approver, `${approver}@lyceumalabang.edu.ph`],
    );
    await run("INSERT INTO permission_slip_signatories (user_id) VALUES (?)", [approver]);
    const input = {
      department: "College",
      requestedDate: "2099-01-01",
      timeOut: "10:00",
      timeIn: "11:00",
      reason: "Official school errand",
      employeeSignature: "data:image/png;base64," + "a".repeat(100),
    };
    await run(`CREATE TRIGGER test_permission_history_failure BEFORE INSERT ON permission_history
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced history failure'`);
    try {
      await expect(submitPermissionSlip(input)).rejects.toThrow("forced history failure");
      expect(
        await all("SELECT id FROM permission_slips WHERE employee_id = ?", [employee.id]),
      ).toHaveLength(0);
      expect(sendPermissionSlipEmail).not.toHaveBeenCalled();
    } finally {
      await run("DROP TRIGGER test_permission_history_failure");
    }
    await expect(submitPermissionSlip(input)).resolves.toHaveProperty("id");
    expect(
      await all("SELECT id FROM permission_slips WHERE employee_id = ?", [employee.id]),
    ).toHaveLength(1);
  });

  it("stores the shared working-day deadline for a new COE request", async () => {
    const employee = await account();
    const earliest = Math.floor(coeProcessingDeadline(new Date()).getTime() / 1000);
    const request = await submitCoeRequest({
      requestorType: "internal",
      employeeName: "Security Fixture",
      employeeEmail: employee.email,
      department: "College",
      purpose: "Employment verification",
      copyType: "original",
    });
    const latest = Math.ceil(coeProcessingDeadline(new Date()).getTime() / 1000);
    const rows = await all(
      "SELECT UNIX_TIMESTAMP(deadline_at) AS deadline FROM hrdo_coe_requests WHERE id = ?",
      [request.id],
    );
    expect(Number(rows[0]?.["deadline"])).toBeGreaterThanOrEqual(earliest);
    expect(Number(rows[0]?.["deadline"])).toBeLessThanOrEqual(latest);
  });
});
