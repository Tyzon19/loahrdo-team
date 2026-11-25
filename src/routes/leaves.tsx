import { createFileRoute, Outlet, redirect, Link } from "@tanstack/react-router";
import { AttendanceShell } from "@/components/attendance/AttendanceShell";
import {
  ATTENDANCE_SYSTEM,
  attendanceAdminAllowed,
  safeAttendanceTarget,
} from "@/lib/attendance-access";

export const Route = createFileRoute("/leaves")({
  beforeLoad: ({ context, location }) => {
    const path = location.pathname.replace(/\/+$/, "");
    if (path === "/leaves/login") return;
    const user = context.attendanceViewer;
    if (!user)
      throw redirect({
        to: "/leaves/login",
        search: { redirect: safeAttendanceTarget(location.pathname), error: undefined },
      });
    if ((user.mustChangePassword || user.needsProfileCompletion) && path !== "/leaves/account")
      throw redirect({ to: "/leaves/account" });
    if (path === "/leaves" && attendanceAdminAllowed(user))
      throw redirect({ to: "/admin/late-absences" });
  },
  head: () => ({
    meta: [
      { title: ATTENDANCE_SYSTEM },
      {
        name: "description",
        content: "HRDO employee leave balances, attendance history and incident responses.",
      },
      { property: "og:title", content: ATTENDANCE_SYSTEM },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AttendanceLayout,
  errorComponent: () => (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-xl font-semibold">Leave & Attendance is temporarily unavailable</h1>
      <p className="my-3">Please try again or contact HRDO.</p>
      <Link to="/leaves">Return to attendance</Link>
    </div>
  ),
});
function AttendanceLayout() {
  const { attendanceViewer } = Route.useRouteContext();
  return attendanceViewer ? (
    <AttendanceShell user={attendanceViewer}>
      <Outlet />
    </AttendanceShell>
  ) : (
    <Outlet />
  );
}
