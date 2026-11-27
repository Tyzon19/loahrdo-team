import { beforeEach, describe, expect, it, vi } from "vitest";
import { all } from "@/server/db";
import { requireAttendanceSession } from "@/server/attendance-auth";
import { listLeaves } from "@/server/leaves";

vi.mock("@/server/db", () => ({ all: vi.fn(), run: vi.fn(), withTransaction: vi.fn() }));
vi.mock("@/server/attendance-auth", () => ({ requireAttendanceSession: vi.fn() }));
vi.mock("@/server/attendance", () => ({ authenticateSheetsWebhook: vi.fn() }));
vi.mock("@/server/gmail", () => ({ sendLeaveEmail: vi.fn() }));

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test Employee",
  email: "employee@example.com",
  department: "Administration",
  role: "EMPLOYEE" as const,
  accountRole: "requisitioner" as const,
  hrdoUserId: null,
  mustChangePassword: false,
  needsProfileCompletion: false,
  canChangePassword: true,
};

const profile = {
  full_name: "Test Employee",
  department_group: "COLLEGE",
  cycle_start: "2026-01-01",
  cycle_end: "2026-12-31",
  working_dates: null,
};

function configureListQueries(profileQuery: () => Promise<unknown>) {
  vi.mocked(all).mockImplementation(async (sql: string) => {
    if (sql.includes("FROM leave_reporting_lines")) return [] as never;
    if (sql.includes("FROM users")) return [] as never;
    if (sql.includes("FROM leave_requests")) return [] as never;
    if (sql.includes("LEFT JOIN attendance_workday_calendars")) return (await profileQuery()) as never;
    if (sql.includes("FROM hr_sheet_profiles")) return [profile] as never;
    if (sql.includes("FROM leave_email_outbox")) return [{ total: 0 }] as never;
    throw new Error(`Unexpected query: ${sql}`);
  });
}

describe("listLeaves", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAttendanceSession).mockResolvedValue(user);
  });

  it("keeps applications viewable when the workday calendar table is missing", async () => {
    const missingTable = Object.assign(new Error("Table does not exist"), {
      code: "ER_NO_SUCH_TABLE",
    });
    configureListQueries(() => Promise.reject(missingTable));

    await expect(listLeaves()).resolves.toMatchObject({
      requests: [],
      profile: {
        name: "Test Employee",
        cycleStart: "2026-01-01",
        cycleEnd: "2026-12-31",
        workingDates: null,
      },
      workdayCalendarAvailable: false,
      pendingEmails: 0,
    });
  });

  it("does not hide errors other than a missing workday calendar table", async () => {
    configureListQueries(() => Promise.reject(new Error("Database unavailable")));

    await expect(listLeaves()).rejects.toThrow("Database unavailable");
  });
});
