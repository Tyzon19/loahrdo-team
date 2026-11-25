import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { all, run, getPool } from "@/server/db";
import { viewer } from "@/server/auth";
import { hrdoViewer } from "@/server/hrdo/auth";
import {
  getMyAttendance,
  getAttendanceAdmin,
  ingestSheetsSnapshot,
  submitAttendanceClaim,
  approveAttendanceClaim,
  respondToAttendanceIncident,
} from "@/server/attendance";
import { handleSheetsSync } from "@/server/attendance-webhook";
import { markAttendanceNotificationRead } from "@/server/late-absences";
import type { Viewer } from "@/lib/types";
import type { HrdoViewer } from "@/lib/hrdo";

vi.mock("@/server/auth", () => ({ viewer: vi.fn() }));
vi.mock("@/server/hrdo/auth", () => ({ hrdoViewer: vi.fn() }));
// Business-operation fixtures supply a verified attendance session. Real cookie
// separation and account provisioning are exercised in attendance-auth.integration.
vi.mock("@/server/attendance-auth", () => {
  const current = async () => {
    const main = await viewer();
    if (main)
      return {
        ...main,
        accountRole: main.role,
        hrdoUserId: null,
        canChangePassword: true,
        role: main.isSuperAdmin ? "SUPER_ADMIN" : "EMPLOYEE",
      };
    const h = await hrdoViewer();
    if (!h || h.isExternal)
      throw new Error(
        "Only HRDO administrators can manage attendance; sign in with an institutional account.",
      );
    return {
      ...h,
      accountRole: "requisitioner",
      hrdoUserId: h.id,
      canChangePassword: true,
      needsProfileCompletion: false,
      role: h.role === "hrdo_admin" ? "HRDO_ADMIN" : "EMPLOYEE",
    };
  };
  return { requireAttendanceSession: current, attendanceViewer: current };
});
// Laragon's disposable local test DB may use the default empty root password;
// production keeps its existing nonempty-password requirement.
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
const employee: Viewer = {
  id: randomUUID(),
  name: "Carl Christian Concepcion",
  email: "carl.concepcion@lyceumalabang.edu.ph",
  role: "requisitioner",
  department: "College",
  isSuperAdmin: false,
  mustChangePassword: false,
  needsProfileCompletion: false,
};
const other: Viewer = {
  ...employee,
  id: randomUUID(),
  name: "Lariza G Concepcion",
  email: "lariza.concepcion@lyceumalabang.edu.ph",
};
const superAdmin: Viewer = {
  ...employee,
  id: randomUUID(),
  role: "admin",
  email: "super@lyceumalabang.edu.ph",
  isSuperAdmin: true,
};
const hr: HrdoViewer = {
  id: randomUUID(),
  name: "HR Allysa",
  email: "allysa@lyceumalabang.edu.ph",
  role: "hrdo_admin",
  department: "HRDO",
  mustChangePassword: false,
  isExternal: false,
};
const spreadsheetId = "test_non_teaching_spreadsheet_123456789";
let sequence = 0;

function snapshot(names = ["CONCEPCION, CARL CHRISTIAN", "CONCEPCION, LARIZA G."]) {
  const values = Array.from({ length: 7 + names.length }, () => Array<string>(395).fill(""));
  values[0]![0] = "6";
  values[1]![0] = "2026";
  for (const [i, name] of names.entries()) {
    const row = values[7 + i]!;
    row[0] = name;
    row[1] = "L";
    row[32] = "HE";
    row[372] = "A";
    row[373] = "1";
    row[374] = "1.5";
    row[386] = "4.5";
    row[387] = "5";
    row[388] = "5";
  }
  return {
    snapshotId: randomUUID(),
    departmentGroup: "NON_TEACHING" as const,
    spreadsheetId,
    sheetName: "STAFF" as const,
    capturedAt: new Date(Date.now() - 86400000 + sequence++ * 1000).toISOString(),
    values,
  };
}
function claim() {
  return submitAttendanceClaim({
    firstName: "Carl Christian",
    middleInitial: "",
    lastName: "Concepcion",
    departmentGroup: "NON_TEACHING",
  });
}
async function approveFirst() {
  vi.mocked(viewer).mockResolvedValue(employee);
  await claim();
  vi.mocked(viewer).mockResolvedValue(null);
  vi.mocked(hrdoViewer).mockResolvedValue(hr);
  const panel = await getAttendanceAdmin();
  const pending = panel.claims.find((c) => c.email === employee.email)!;
  await approveAttendanceClaim({ claimId: pending.id, profileId: pending.candidates[0]!.id });
  vi.mocked(viewer).mockResolvedValue(employee);
  vi.mocked(hrdoViewer).mockResolvedValue(null);
}

describe.skipIf(!safe)("attendance acceptance against isolated MySQL", () => {
  beforeEach(async () => {
    vi.mocked(viewer).mockResolvedValue(employee);
    vi.mocked(hrdoViewer).mockResolvedValue(null);
    for (const table of [
      "attendance_incident_responses",
      "attendance_notifications",
      "attendance_profile_claims",
      "attendance_leave_incidents",
      "hr_sheet_profiles",
      "sync_audit_logs",
      "sheet_sources",
      "users",
      "hrdo_users",
    ]) {
      await run(`DELETE FROM ${table}`);
    }
    for (const user of [
      employee,
      other,
      superAdmin,
      { ...employee, id: hr.id, email: hr.email, name: hr.name },
    ])
      await run(
        "INSERT INTO users (id, name, email, password_hash, role, is_super_admin) VALUES (?, ?, ?, 'test', ?, ?)",
        [user.id, user.name, user.email, user.role, Number(user.isSuperAdmin)],
      );
    await run(
      "INSERT INTO hrdo_users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'test', 'hrdo_admin')",
      [hr.id, hr.name, hr.email],
    );
    await run(
      "INSERT INTO sheet_sources (id, staff_group, spreadsheet_id) VALUES (?, 'NON_TEACHING', ?)",
      [randomUUID(), spreadsheetId],
    );
  });
  afterAll(async () => {
    await (await getPool()).end();
  });

  it("ingests all rows before accounts are claimed, then links only the exact given name", async () => {
    const result = await ingestSheetsSnapshot(snapshot());
    expect(result.rowsSeen).toBe(2);
    expect((await getMyAttendance()).profile).toBeNull();
    expect((await getMyAttendance()).logs).toEqual([]);
    await approveFirst();
    const mine = await getMyAttendance();
    expect(mine.profile?.fullName).toBe("CONCEPCION, CARL CHRISTIAN");
    expect(mine.profile?.remainingEl).toBe(4.5);
    expect(mine.logs.map((i) => [i.date, i.code, i.days])).toEqual([
      ["2027-05-31", "ABSENT", 0],
      ["2026-07-01", "HE", 0.5],
      ["2026-06-01", "LATE", 0],
    ]);
    expect(mine.notifications).toHaveLength(2);
    vi.mocked(viewer).mockResolvedValue(other);
    expect((await getMyAttendance()).profile).toBeNull();
    expect((await getMyAttendance()).logs).toHaveLength(0);
  });

  it("requires explicit HRDO selection for identical duplicate rows", async () => {
    await ingestSheetsSnapshot(
      snapshot(["CONCEPCION, CARL CHRISTIAN", "CONCEPCION, CARL CHRISTIAN"]),
    );
    expect(await claim()).toEqual({ status: "DUPLICATE_REVIEW_REQUIRED" });
    vi.mocked(viewer).mockResolvedValue(superAdmin);
    const pending = (await getAttendanceAdmin()).claims[0]!;
    expect(pending.candidates.map((p) => p.row)).toEqual([8, 9]);
    await approveAttendanceClaim({ claimId: pending.id, profileId: pending.candidates[1]!.id });
    const links = await all(
      "SELECT sheet_row_number FROM hr_sheet_profiles WHERE claimed_by_user_id = ?",
      [employee.id],
    );
    expect(links[0]!["sheet_row_number"]).toBe(9);
    await approveAttendanceClaim({ claimId: pending.id, profileId: pending.candidates[1]!.id });
    expect(
      await all("SELECT id FROM attendance_notifications WHERE user_id = ?", [employee.id]),
    ).toHaveLength(2);
  });

  it("rejects approving a different person with the same surname", async () => {
    await ingestSheetsSnapshot(snapshot());
    await claim();
    const wrong = await all("SELECT id FROM hr_sheet_profiles WHERE sheet_row_number = 9");
    const claims = await all("SELECT id FROM attendance_profile_claims");
    vi.mocked(viewer).mockResolvedValue(superAdmin);
    await expect(
      approveAttendanceClaim({ claimId: claims[0]!["id"], profileId: wrong[0]!["id"] }),
    ).rejects.toThrow("matching this claim");
    expect(
      await all("SELECT id FROM hr_sheet_profiles WHERE claimed_by_user_id IS NOT NULL"),
    ).toHaveLength(0);
  });

  it("does not expose candidate names or balances in a claim response", async () => {
    await ingestSheetsSnapshot(snapshot());
    expect(await claim()).toEqual({ status: "PENDING_REVIEW" });
    expect((await getMyAttendance()).claim).toEqual({
      status: "PENDING_REVIEW",
      firstName: "Carl Christian",
      middleInitial: "",
      lastName: "Concepcion",
      departmentGroup: "NON_TEACHING",
    });
    await expect(
      submitAttendanceClaim({
        firstName: "Carl Christian",
        lastName: "Concepcion",
        middleInitial: "",
        departmentGroup: "NON_TEACHING",
        profileId: randomUUID(),
      }),
    ).rejects.toThrow();
  });

  it("keeps a no-match claim for HRDO without binding a partial given name", async () => {
    await ingestSheetsSnapshot(snapshot());
    expect(
      await submitAttendanceClaim({
        firstName: "Carl",
        middleInitial: "",
        lastName: "Concepcion",
        departmentGroup: "NON_TEACHING",
      }),
    ).toEqual({ status: "NO_MATCH_REVIEW_REQUIRED" });
    expect((await getMyAttendance()).profile).toBeNull();
  });

  it("serializes simultaneous claim approvals so a row cannot be claimed twice", async () => {
    await ingestSheetsSnapshot(snapshot());
    await claim();
    vi.mocked(viewer).mockResolvedValue(other);
    await claim();
    vi.mocked(viewer).mockResolvedValue(superAdmin);
    const claims = (await getAttendanceAdmin()).claims;
    const profileId = claims[0]!.candidates[0]!.id;
    const results = await Promise.allSettled(
      claims.map((c) => approveAttendanceClaim({ claimId: c.id, profileId })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await all("SELECT id FROM hr_sheet_profiles WHERE claimed_by_user_id IS NOT NULL"),
    ).toHaveLength(1);
  });

  it("deduplicates retries and identical resyncs without clearing acknowledgment", async () => {
    const payload = snapshot();
    await ingestSheetsSnapshot(payload);
    await approveFirst();
    const late = (await getMyAttendance()).logs.find((i) => i.code === "LATE")!;
    await respondToAttendanceIncident({
      incidentId: late.id,
      revision: late.revision,
      explanation: "Traffic delay at the gate.",
    });
    expect((await ingestSheetsSnapshot(payload)).duplicate).toBe(true);
    await ingestSheetsSnapshot(snapshot());
    const current = (await getMyAttendance()).logs.find((i) => i.id === late.id)!;
    expect(current.acknowledgedAt).toBeTruthy();
    expect(current.explanation).toContain("Traffic");
    expect((await getMyAttendance()).notifications).toHaveLength(2);
  });

  it("rejects another employee's incident ID and forged profile identity", async () => {
    await ingestSheetsSnapshot(snapshot());
    await approveFirst();
    const late = (await getMyAttendance()).logs.find((i) => i.code === "LATE")!;
    vi.mocked(viewer).mockResolvedValue(other);
    await expect(
      respondToAttendanceIncident({ incidentId: late.id, revision: late.revision }),
    ).rejects.toThrow("unavailable");
    vi.mocked(viewer).mockResolvedValue(employee);
    await expect(
      respondToAttendanceIncident({
        incidentId: late.id,
        revision: late.revision,
        profileId: randomUUID(),
      }),
    ).rejects.toThrow();
    expect((await getMyAttendance()).logs.find((i) => i.id === late.id)!.acknowledgedAt).toBeNull();
  });

  it("resets acknowledgment after a code correction and retains the previous explanation", async () => {
    await ingestSheetsSnapshot(snapshot());
    await approveFirst();
    const late = (await getMyAttendance()).logs.find((i) => i.code === "LATE")!;
    await respondToAttendanceIncident({
      incidentId: late.id,
      revision: late.revision,
      explanation: "Original late explanation.",
    });
    const next = snapshot();
    next.values[7]![1] = "ABSENT";
    await ingestSheetsSnapshot(next);
    const changed = (await getMyAttendance()).logs.find((i) => i.id === late.id)!;
    expect(changed.revision).toBe(late.revision + 1);
    expect(changed.acknowledgedAt).toBeNull();
    expect(changed.explanation).toBeNull();
    await expect(
      respondToAttendanceIncident({ incidentId: late.id, revision: late.revision }),
    ).rejects.toThrow("changed");
    expect((await getMyAttendance()).notifications).toHaveLength(3);
    vi.mocked(viewer).mockResolvedValue(superAdmin);
    expect((await getAttendanceAdmin()).explanations[0]).toMatchObject({
      explanation: "Original late explanation.",
      current: false,
    });
  });

  it("soft-removes cleared incidents and hides missing profiles without rebinding", async () => {
    await ingestSheetsSnapshot(snapshot());
    await approveFirst();
    const next = snapshot();
    next.values[7]![1] = "";
    await ingestSheetsSnapshot(next);
    expect((await getMyAttendance()).logs.some((i) => i.code === "LATE")).toBe(false);
    expect(await all("SELECT id FROM attendance_leave_incidents WHERE is_active = 0")).toHaveLength(
      1,
    );
    const missing = snapshot();
    missing.values[7]![0] = "";
    await ingestSheetsSnapshot(missing);
    expect((await getMyAttendance()).profile?.active).toBe(false);
    expect((await getMyAttendance()).logs).toHaveLength(0);
    await expect(claim()).rejects.toThrow("already has");
  });

  it("rejects row identity changes atomically and logs the failed snapshot", async () => {
    await ingestSheetsSnapshot(snapshot());
    await approveFirst();
    const next = snapshot();
    next.values[7]![386] = "0";
    next.values[8]![0] = "CONCEPCION, ANOTHER PERSON";
    await expect(ingestSheetsSnapshot(next)).rejects.toThrow("Identity changed");
    expect((await getMyAttendance()).profile?.remainingEl).toBe(4.5);
    expect(
      (await all("SELECT status FROM sync_audit_logs WHERE id = ?", [next.snapshotId]))[0]![
        "status"
      ],
    ).toBe("FAILED");
  });

  it("rejects unknown codes and bad balances without overwriting good data", async () => {
    await ingestSheetsSnapshot(snapshot());
    const bad = snapshot();
    bad.values[7]![386] = "#REF!";
    await expect(ingestSheetsSnapshot(bad)).rejects.toThrow("invalid balance");
    const unknown = snapshot();
    unknown.values[7]![1] = "UNKNOWN";
    await expect(ingestSheetsSnapshot(unknown)).rejects.toThrow("Unsupported code");
    expect(await all("SELECT id FROM attendance_leave_incidents WHERE is_active = 1")).toHaveLength(
      6,
    );
  });

  it("ignores stale snapshots, forbids UUID content reuse, and checks tracker ownership", async () => {
    const old = snapshot(),
      newer = snapshot();
    await ingestSheetsSnapshot(newer);
    expect((await ingestSheetsSnapshot(old)).stale).toBe(true);
    newer.values[7]![386] = "0";
    await expect(ingestSheetsSnapshot(newer)).rejects.toThrow("different contents");
    await expect(
      ingestSheetsSnapshot({ ...snapshot(), spreadsheetId: "different_tracker_id_123456789" }),
    ).rejects.toThrow("configured department");
  });

  it("authenticates the webhook before JSON parsing and accepts the pushed grid", async () => {
    const make = (body: string, secret?: string) =>
      new Request("https://hrdo.example/api/webhooks/sheets-sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(secret ? { "x-hrdo-webhook-secret": secret } : {}),
        },
        body,
      });
    expect((await handleSheetsSync(make("invalid"))).status).toBe(401);
    expect((await handleSheetsSync(make("invalid", "wrong"))).status).toBe(401);
    const secret = process.env["HRDO_SHEETS_WEBHOOK_SECRET"]!;
    expect((await handleSheetsSync(make("invalid", secret))).status).toBe(400);
    const response = await handleSheetsSync(make(JSON.stringify(snapshot()), secret));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, result: { rowsSeen: 2 } });
    const tooBig = make("{}", secret);
    tooBig.headers.set("content-length", String(9 * 1024 * 1024));
    expect((await handleSheetsSync(tooBig)).status).toBe(413);
  });

  it("scopes notification reads to the authenticated account", async () => {
    await ingestSheetsSnapshot(snapshot());
    await approveFirst();
    const id = (await getMyAttendance()).notifications[0]!.id;
    vi.mocked(viewer).mockResolvedValue(other);
    await expect(markAttendanceNotificationRead(id)).rejects.toThrow("not found");
    vi.mocked(viewer).mockResolvedValue(employee);
    await markAttendanceNotificationRead(id);
    expect((await getMyAttendance()).notifications.find((n) => n.id === id)?.read).toBe(true);
  });

  it("isolates identical names and row numbers across trackers", async () => {
    await ingestSheetsSnapshot(snapshot());
    await run(
      "INSERT INTO sheet_sources (id, staff_group, spreadsheet_id) VALUES (?, 'COLLEGE', ?)",
      [randomUUID(), "test_college_spreadsheet_123456789"],
    );
    const college = {
      ...snapshot(["CONCEPCION, CARL CHRISTIAN"]),
      departmentGroup: "COLLEGE",
      spreadsheetId: "test_college_spreadsheet_123456789",
    };
    await ingestSheetsSnapshot(college);
    expect(await claim()).toEqual({ status: "PENDING_REVIEW" });
    expect(await all("SELECT id FROM hr_sheet_profiles WHERE sheet_row_number = 8")).toHaveLength(
      2,
    );
  });

  it("serializes concurrent snapshots and keeps the newest balances", async () => {
    const older = snapshot(),
      newer = snapshot();
    older.values[7]![386] = "3";
    newer.values[7]![386] = "4";
    await Promise.all([ingestSheetsSnapshot(older), ingestSheetsSnapshot(newer)]);
    const rows = await all("SELECT remaining_el FROM hr_sheet_profiles WHERE sheet_row_number = 8");
    expect(Number(rows[0]!["remaining_el"])).toBe(4);
  });

  it("denies employees, external accounts and HRDO staff access to the admin queue", async () => {
    await expect(getAttendanceAdmin()).rejects.toThrow("Only HRDO");
    vi.mocked(hrdoViewer).mockResolvedValue({ ...hr, role: "hrdo_staff" });
    await expect(getAttendanceAdmin()).rejects.toThrow("Only HRDO");
    vi.mocked(hrdoViewer).mockResolvedValue({ ...hr, isExternal: true });
    await expect(getAttendanceAdmin()).rejects.toThrow("Only HRDO");
    vi.mocked(viewer).mockResolvedValue({ ...employee, email: "person@gmail.com" });
    await expect(getMyAttendance()).rejects.toThrow("institutional");
    vi.mocked(viewer).mockResolvedValue(null);
    vi.mocked(hrdoViewer).mockResolvedValue(hr);
    await expect(getMyAttendance()).rejects.toThrow("administration panel");
    expect((await getAttendanceAdmin()).sources).toHaveLength(3);
  });
});
