import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { all, getPool, run } from "@/server/db";
import {
  attendanceViewer,
  createAttendanceSession,
  ensureAttendanceGoogleAccount,
  attendanceLogin,
  attendanceLogout,
  completeAttendanceProfile,
  changeAttendancePassword,
  ATTENDANCE_SESSION_COOKIE,
} from "@/server/attendance-auth";
import { login, viewer, createSession, requireTransportViewer } from "@/server/auth";
import { permissionLogin, permissionViewer } from "@/server/permission/auth";
import { hrdoLogin, hrdoViewer, ensureHrdoGoogleAccount } from "@/server/hrdo/auth";
import { listRequests } from "@/server/requests";
import { listAdminReceipts } from "@/server/admin-receipts";
import { hashPassword } from "@/server/password";
import { safeAttendanceTarget } from "@/lib/attendance-access";

vi.mock("@tanstack/react-start/server", () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  getRequestHeader: vi.fn(),
  getRequestIP: vi.fn(),
}));
vi.mock("@/server/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/env")>();
  return {
    ...actual,
    serverEnv: (key: string) =>
      key === "DB_PASSWORD" ? (process.env["DB_PASSWORD"] ?? "") : actual.serverEnv(key),
  };
});
const safe =
  process.env["ATTENDANCE_TEST_DB_SAFE"] === "1" &&
  /^loa_attendance_test_[a-f0-9]{16}$/.test(process.env["DB_NAME"] ?? "");
const email = "scope.employee@lyceumalabang.edu.ph";
const password = "TestScopeOnly!2026";
let cookies: Record<string, string>;

describe.skipIf(!safe)("Attendance portal authentication and scope", () => {
  beforeAll(async () => {
    const rows = await all("SELECT DATABASE() AS name");
    if (
      rows[0]?.["name"] !== process.env["DB_NAME"] ||
      !/^loa_attendance_test_/.test(String(rows[0]?.["name"]))
    )
      throw new Error("Refusing to run outside the disposable test database.");
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    cookies = {};
    vi.mocked(getCookie).mockImplementation((name) => cookies[name]);
    vi.mocked(setCookie).mockImplementation((name, value) => {
      cookies[name] = value;
    });
    vi.mocked(deleteCookie).mockImplementation((name) => {
      delete cookies[name];
    });
    await run("DELETE FROM attendance_sessions");
    await run("DELETE FROM attendance_only_accounts");
    // Remove only this suite's deliberately created identity, never other fixtures.
    await run(
      "DELETE FROM permission_sessions WHERE user_id IN (SELECT id FROM users WHERE email = ?)",
      [email],
    );
    await run("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ?)", [
      email,
    ]);
    await run(
      "DELETE FROM hrdo_sessions WHERE user_id IN (SELECT id FROM hrdo_users WHERE email = ?)",
      [email],
    );
    await run("DELETE FROM users WHERE email = ?", [email]);
    await run("DELETE FROM hrdo_users WHERE email = ?", [email]);
  });
  afterAll(async () => {
    await (await getPool()).end();
    delete (globalThis as { __loaDbPoolPromise?: unknown }).__loaDbPoolPromise;
  });

  async function newAttendanceAccount() {
    const id = await ensureAttendanceGoogleAccount(email, "Attendance Only Employee");
    await run("UPDATE users SET password_hash = ? WHERE id = ?", [
      await hashPassword(password),
      id,
    ]);
    return id;
  }

  it("provisions only an attendance identity, with no COE account or other session", async () => {
    const id = await newAttendanceAccount();
    expect(
      await all("SELECT user_id FROM attendance_only_accounts WHERE user_id = ?", [id]),
    ).toHaveLength(1);
    expect(await all("SELECT id FROM hrdo_users WHERE email = ?", [email])).toHaveLength(0);
    expect(await all("SELECT id FROM sessions WHERE user_id = ?", [id])).toHaveLength(0);
    expect(await all("SELECT id FROM permission_sessions WHERE user_id = ?", [id])).toHaveLength(0);
  });

  it("issues only loa_attendance_session when using an existing password", async () => {
    const id = await newAttendanceAccount();
    expect(await attendanceLogin({ email, password, redirect: "/requests" })).toEqual({
      destination: "/leaves",
    });
    expect(Object.keys(cookies)).toEqual([ATTENDANCE_SESSION_COOKIE]);
    expect((await attendanceViewer())?.id).toBe(id);
    const rows = await all("SELECT token_hash FROM attendance_sessions WHERE user_id = ?", [id]);
    expect(String(rows[0]?.["token_hash"])).toHaveLength(64);
    expect(rows[0]?.["token_hash"]).not.toBe(cookies[ATTENDANCE_SESSION_COOKIE]);
  });

  it("returns the destination before the new session cookie is readable from the request", async () => {
    await newAttendanceAccount();
    // In the real server, setCookie writes the response while getCookie still reads
    // the incoming request, so the freshly issued session is not visible yet.
    vi.mocked(setCookie).mockImplementation(() => {});
    await expect(attendanceLogin({ email, password })).resolves.toEqual({
      destination: "/leaves",
    });
  });

  it("rejects attendance-only credentials at VHTT, Permission Slip and COE login", async () => {
    const id = await newAttendanceAccount();
    await expect(login({ email, password })).rejects.toThrow("limited to Leave & Attendance");
    await expect(createSession(id)).rejects.toThrow("limited to Leave & Attendance");
    await expect(permissionLogin({ email, password })).rejects.toThrow(
      "limited to Leave & Attendance",
    );
    await expect(hrdoLogin({ email, password })).rejects.toThrow("limited to Leave & Attendance");
    await expect(ensureHrdoGoogleAccount(email)).rejects.toThrow("limited to Leave & Attendance");
    expect(await all("SELECT id FROM sessions WHERE user_id = ?", [id])).toHaveLength(0);
  });

  it("an attendance cookie grants no transport, COE or Permission Slip API access", async () => {
    const id = await newAttendanceAccount();
    const session = await createAttendanceSession(id);
    cookies[ATTENDANCE_SESSION_COOKIE] = session.token;
    expect((await attendanceViewer())?.role).toBe("EMPLOYEE");
    expect(await viewer()).toBeNull();
    expect(await permissionViewer()).toBeNull();
    expect(await hrdoViewer()).toBeNull();
    await expect(requireTransportViewer()).rejects.toThrow("sign in");
    await expect(listRequests({})).rejects.toThrow("sign in");
    await expect(listAdminReceipts({})).rejects.toThrow("sign in");
  });

  it("main/COE/Permission Slip cookies cannot authenticate attendance", async () => {
    const id = await newAttendanceAccount();
    const session = await createAttendanceSession(id);
    cookies = {
      loa_session: session.token,
      loa_hrdo_session: session.token,
      loa_permission_session: session.token,
    };
    expect(await attendanceViewer()).toBeNull();
    expect(await all("SELECT id FROM attendance_sessions WHERE user_id = ?", [id])).toHaveLength(1);
  });

  it("blocks forged main sessions even when an attendance token is reused as loa_session", async () => {
    const id = await newAttendanceAccount();
    const session = await createAttendanceSession(id);
    await run(
      `INSERT INTO sessions (id,user_id,token_hash,expires_at)
      SELECT ?,user_id,token_hash,expires_at FROM attendance_sessions WHERE user_id = ?`,
      [randomUUID(), id],
    );
    cookies["loa_session"] = session.token;
    expect(await viewer()).toBeNull();
    expect(cookies["loa_session"]).toBeUndefined();
  });

  it("signs out only from attendance and preserves unrelated cookies", async () => {
    const id = await newAttendanceAccount();
    const session = await createAttendanceSession(id);
    cookies = {
      [ATTENDANCE_SESSION_COOKIE]: session.token,
      loa_session: "existing-main-cookie",
      loa_hrdo_session: "existing-coe-cookie",
    };
    await attendanceLogout();
    expect(cookies).toEqual({
      loa_session: "existing-main-cookie",
      loa_hrdo_session: "existing-coe-cookie",
    });
    expect(await all("SELECT id FROM attendance_sessions WHERE user_id = ?", [id])).toHaveLength(0);
  });

  it("rejects expired attendance sessions", async () => {
    const id = await newAttendanceAccount();
    const session = await createAttendanceSession(id);
    cookies[ATTENDANCE_SESSION_COOKIE] = session.token;
    await run(
      "UPDATE attendance_sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE user_id = ?",
      [id],
    );
    expect(await attendanceViewer()).toBeNull();
    expect(cookies[ATTENDANCE_SESSION_COOKIE]).toBeUndefined();
  });

  it("completes an attendance profile without creating a main session", async () => {
    const id = await newAttendanceAccount();
    await run("UPDATE users SET profile_complete = 0 WHERE id = ?", [id]);
    const session = await createAttendanceSession(id);
    cookies[ATTENDANCE_SESSION_COOKIE] = session.token;
    await completeAttendanceProfile({ firstName: "New", middleName: "", lastName: "Employee" });
    expect(await attendanceViewer()).toMatchObject({
      name: "New Employee",
      needsProfileCompletion: false,
    });
    expect(cookies["loa_session"]).toBeUndefined();
  });

  it("updates a linked HRDO admin's password atomically inside attendance", async () => {
    const hrdoId = randomUUID();
    await run(
      "INSERT INTO hrdo_users (id,name,email,password_hash,role,must_change_password) VALUES (?, 'HR Admin', ?, ?, 'hrdo_admin', 1)",
      [hrdoId, email, await hashPassword(password)],
    );
    const id = await ensureAttendanceGoogleAccount(email);
    const session = await createAttendanceSession(id);
    cookies[ATTENDANCE_SESSION_COOKIE] = session.token;
    expect((await attendanceViewer())?.role).toBe("HRDO_ADMIN");
    const newPassword = "NewScopedPassword!2026";
    await expect(
      changeAttendancePassword({
        currentPassword: password,
        newPassword,
        confirmPassword: "mismatch",
      }),
    ).rejects.toThrow("must match");
    await changeAttendancePassword({
      currentPassword: password,
      newPassword,
      confirmPassword: newPassword,
    });
    expect((await attendanceViewer())?.mustChangePassword).toBe(false);
    const rows = await all(
      "SELECT (u.password_hash = h.password_hash) AS hashes_match FROM users u JOIN hrdo_users h ON h.email = u.email WHERE u.id = ?",
      [id],
    );
    expect(Number(rows[0]?.["hashes_match"])).toBe(1);
    expect(cookies["loa_session"]).toBeUndefined();
  });

  it("preserves previously established access for existing LOA accounts", async () => {
    const id = randomUUID();
    await run(
      "INSERT INTO users (id,name,email,password_hash,role,profile_complete) VALUES (?, 'Existing Employee', ?, ?, 'requisitioner', 1)",
      [id, email, await hashPassword(password)],
    );
    expect(await ensureAttendanceGoogleAccount(email)).toBe(id);
    expect(
      await all("SELECT user_id FROM attendance_only_accounts WHERE user_id = ?", [id]),
    ).toHaveLength(0);
    await login({ email, password });
    expect((await viewer())?.id).toBe(id);
    expect(cookies[ATTENDANCE_SESSION_COOKIE]).toBeUndefined();
  });

  it.each([
    "/dashboard",
    "/requests",
    "/permission-slips",
    "/hrdo/coe",
    "/receipts",
    "//evil.test",
    "https://evil.test",
    "/leaves/login",
    "/leaves-elsewhere",
    "%2F%2Fevil.test",
  ])("contains redirect %s inside attendance", (value) => {
    expect(safeAttendanceTarget(value)).toBe("/leaves");
  });
});
