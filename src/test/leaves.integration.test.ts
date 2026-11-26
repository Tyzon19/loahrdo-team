import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { all, run } from "@/server/db";
import {
  createLeave,
  decideLeave,
  getLeave,
  leaveTrackerJobs,
  saveLeaveReportingLine,
} from "@/server/leaves";
import { requireAttendanceSession } from "@/server/attendance-auth";
import type { AttendanceViewer } from "@/lib/attendance-access";

vi.mock("@/server/attendance-auth", () => ({ requireAttendanceSession: vi.fn() }));
vi.mock("@/server/gmail", () => ({ sendLeaveEmail: vi.fn().mockResolvedValue(undefined) }));
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
const employee: AttendanceViewer = {
  id: randomUUID(),
  name: "Leave Employee",
  email: "leave.employee@lyceumalabang.edu.ph",
  department: "Leave Test",
  accountRole: "requisitioner",
  role: "EMPLOYEE",
  hrdoUserId: null,
  mustChangePassword: false,
  needsProfileCompletion: false,
  canChangePassword: true,
};
const head = {
  ...employee,
  id: randomUUID(),
  name: "Leave Head",
  email: "leave.head@lyceumalabang.edu.ph",
  accountRole: "department_head" as const,
};
const president = {
  ...employee,
  id: randomUUID(),
  name: "President",
  email: "leave.president@lyceumalabang.edu.ph",
  accountRole: "president" as const,
};
const hr = {
  ...employee,
  id: randomUUID(),
  name: "HR",
  email: "leave.hr@lyceumalabang.edu.ph",
  role: "SUPER_ADMIN" as const,
};
const signature = { image: `data:image/png;base64,${"a".repeat(60)}`, method: "drawn" };
function input() {
  return {
    id: randomUUID(),
    code: "V",
    reason: "Family appointment",
    dates: ["2026-11-26"],
    signature,
  };
}
describe.skipIf(!safe)("leave workflow in isolated MySQL", () => {
  afterAll(async () => {
    await run("DELETE FROM leave_reporting_lines");
    for (const table of ["leave_email_outbox", "leave_request_days", "leave_requests"])
      await run(`DELETE FROM ${table}`);
    await run("DELETE FROM hr_sheet_profiles WHERE claimed_by_user_id IN (?)", [
      [employee.id, head.id],
    ]);
    await run("DELETE FROM users WHERE id IN (?)", [[employee.id, head.id, president.id, hr.id]]);
  });
  beforeEach(async () => {
    await run("DELETE FROM leave_reporting_lines");
    for (const table of ["leave_email_outbox", "leave_request_days", "leave_requests"])
      await run(`DELETE FROM ${table}`);
    for (const user of [employee, head, president, hr]) {
      await run(
        "INSERT INTO users(id,name,email,password_hash,role,department,is_super_admin,profile_complete) VALUES(?,?,?,'test',?,?,?,1) ON DUPLICATE KEY UPDATE role=VALUES(role)",
        [
          user.id,
          user.name,
          user.email,
          user.accountRole,
          user.department,
          Number(user.role === "SUPER_ADMIN"),
        ],
      );
    }
    // The isolated fixture may contain a president from another suite.
    await run("UPDATE users SET role='requisitioner' WHERE role='president' AND id<>?", [
      president.id,
    ]);
    for (const [index, user] of [employee, head].entries())
      await run(
        "INSERT INTO hr_sheet_profiles(id,department_group,sheet_row_number,full_name,normalized_full_name,name_key,claimed_by_user_id,cycle_start,cycle_end,synced_at) VALUES(?,'COLLEGE',?,?,?, ?,?,'2026-06-01','2027-05-31',NOW()) ON DUPLICATE KEY UPDATE is_active=1",
        [randomUUID(), 4000 + index, user.name, user.name, user.name, user.id],
      );
    vi.mocked(requireAttendanceSession).mockResolvedValue(employee);
  });
  it("enforces employee -> head -> HR and commits one request on retry", async () => {
    const data = input();
    await createLeave(data);
    await createLeave(data);
    expect((await getLeave(data.id)).recommender_id).toBe(head.id);
    await expect(
      decideLeave({ id: data.id, decision: "approve", signature, note: "" }),
    ).rejects.toThrow("cannot decide");
    vi.mocked(requireAttendanceSession).mockResolvedValue(hr);
    await expect(
      decideLeave({ id: data.id, decision: "approve", signature, note: "", credited: true }),
    ).rejects.toThrow("not awaiting");
    vi.mocked(requireAttendanceSession).mockResolvedValue(head);
    await decideLeave({ id: data.id, decision: "approve", signature, note: "" });
    vi.mocked(requireAttendanceSession).mockResolvedValue(hr);
    await decideLeave({ id: data.id, decision: "approve", signature, note: "", credited: true });
    expect((await getLeave(data.id)).status).toBe("approved");
    expect((await getLeave(data.id)).sync_status).toBe("pending");
    await expect(
      decideLeave({ id: data.id, decision: "approve", signature, note: "", credited: true }),
    ).rejects.toThrow("not awaiting");
    vi.mocked(requireAttendanceSession).mockResolvedValue(president);
    await expect(getLeave(data.id)).rejects.toThrow("access denied");
  });
  it("routes a department head to the president and frees rejected dates", async () => {
    vi.mocked(requireAttendanceSession).mockResolvedValue(head);
    const data = input();
    await createLeave(data);
    expect((await getLeave(data.id)).recommender_id).toBe(president.id);
    await expect(createLeave(input())).rejects.toThrow("already has");
    vi.mocked(requireAttendanceSession).mockResolvedValue(president);
    await decideLeave({
      id: data.id,
      decision: "reject",
      signature,
      note: "Please choose another date",
    });
    vi.mocked(requireAttendanceSession).mockResolvedValue(head);
    await expect(createLeave(input())).resolves.toHaveProperty("id");
    expect((await all("SELECT id FROM leave_email_outbox WHERE sent_at IS NULL")).length).toBe(0);
  });
  it("finalizes not-credited leave without changing paid balances or queuing a tracker write", async () => {
    const data = input();
    await createLeave(data);
    vi.mocked(requireAttendanceSession).mockResolvedValue(head);
    await decideLeave({ id: data.id, decision: "approve", signature, note: "" });
    vi.mocked(requireAttendanceSession).mockResolvedValue(hr);
    await decideLeave({ id: data.id, decision: "approve", signature, note: "", credited: false });
    const leave = await getLeave(data.id);
    expect(leave.status).toBe("approved");
    expect(leave.credited).toBe(0);
    expect(leave.sync_status).toBe("not_required");
    expect(leave.balances).toBeNull();
    const queued = await all<Array<RowDataPacket & { id: string }>>(
      "SELECT id FROM leave_requests WHERE status='approved' AND credited=1 AND sync_status IN ('pending','error')",
    );
    expect(queued.some((row) => row.id === data.id)).toBe(false);
    const secret =
      process.env["HRDO_SHEETS_WEBHOOK_SECRET"] ?? "test-secret-for-attendance-only-1234567890";
    process.env["HRDO_SHEETS_WEBHOOK_SECRET"] = secret;
    const response = await leaveTrackerJobs(
      new Request("http://test/api/webhooks/leave-tracker", {
        method: "POST",
        headers: {
          "x-hrdo-webhook-secret": secret,
          "content-type": "application/json",
        },
        body: JSON.stringify({ id: data.id, utilized: { sl: 0, vl: 0 } }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: expect.stringContaining("Not-credited"),
    });
    expect((await getLeave(data.id)).sync_status).toBe("not_required");
  });
  it("only permits HR to assign reporting lines and honors verified head status", async () => {
    const mapping = { employeeId: employee.id, supervisorId: head.id, isHead: true };
    await expect(saveLeaveReportingLine(mapping)).rejects.toThrow("Only HR");
    vi.mocked(requireAttendanceSession).mockResolvedValue(hr);
    await saveLeaveReportingLine(mapping);
    vi.mocked(requireAttendanceSession).mockResolvedValue(employee);
    const data = input();
    await createLeave(data);
    expect((await getLeave(data.id)).recommender_id).toBe(president.id);
  });
});
