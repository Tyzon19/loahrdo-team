import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AttendanceShell } from "@/components/attendance/AttendanceShell";
import type { AttendanceViewer } from "@/lib/attendance-access";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/server-functions", () => ({ attendanceLogoutFn: vi.fn() }));
const employee: AttendanceViewer = {
  id: "employee",
  name: "Employee",
  email: "employee@lyceumalabang.edu.ph",
  department: "College",
  role: "EMPLOYEE",
  accountRole: "requisitioner",
  hrdoUserId: null,
  mustChangePassword: false,
  needsProfileCompletion: false,
  canChangePassword: true,
};
const html = (user: AttendanceViewer) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <AttendanceShell user={user}>
        <p>Attendance records</p>
      </AttendanceShell>
    </QueryClientProvider>,
  );

describe("Attendance-only portal navigation", () => {
  it("shows attendance branding and only attendance destinations", () => {
    const result = html(employee);
    expect(result).toContain("Leave &amp; Attendance");
    expect(result).toContain('href="/leaves"');
    expect(result).toContain('href="/leaves/account"');
    for (const path of ["/requests", "/dashboard", "/hrdo/", "/permission-slips", "/receipts"])
      expect(result).not.toContain(`href="${path}`);
    expect(result).not.toMatch(/vehicle|trip ticket|certificate of employment|permission slip/i);
  });
  it("gives HRDO admins an attendance queue without other-system navigation", () => {
    const result = html({ ...employee, role: "HRDO_ADMIN" });
    expect(result).toContain('href="/admin/late-absences"');
    expect(result).not.toContain('href="/admin"');
    expect(result).not.toContain('href="/hrdo/dashboard"');
  });
});
