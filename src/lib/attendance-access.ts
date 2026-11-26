import type { Role } from "./types";

export const ATTENDANCE_SYSTEM = "LOA Leave & Attendance";
export interface AttendanceViewer {
  id: string;
  name: string;
  email: string;
  department: string;
  role: "EMPLOYEE" | "HRDO_ADMIN" | "SUPER_ADMIN";
  accountRole: Role;
  hrdoUserId: string | null;
  mustChangePassword: boolean;
  needsProfileCompletion: boolean;
  canChangePassword: boolean;
}

export function attendanceAdminAllowed(user: AttendanceViewer | null | undefined) {
  return user?.role === "HRDO_ADMIN" || user?.role === "SUPER_ADMIN";
}

/** Redirects can stay only inside this system, including its existing admin URLs. */
export function safeAttendanceTarget(value: unknown): string {
  if (typeof value !== "string") return "/leaves";
  let target: string;
  try {
    target = decodeURIComponent(value);
  } catch {
    return "/leaves";
  }
  return [
    "/leaves",
    "/leaves/",
    "/leaves/account",
    "/leaves/requests",
    "/admin/late-absences",
    "/director/late-absences",
  ].includes(target)
    ? target
    : "/leaves";
}

export function attendanceDestination(user: AttendanceViewer, requested?: unknown) {
  if (user.needsProfileCompletion || user.mustChangePassword) return "/leaves/account";
  const target = safeAttendanceTarget(requested);
  if (target === "/admin/late-absences" && !attendanceAdminAllowed(user)) return "/leaves";
  if (target === "/director/late-absences" && user.accountRole !== "director") return "/leaves";
  return target === "/leaves" && attendanceAdminAllowed(user) ? "/admin/late-absences" : target;
}
