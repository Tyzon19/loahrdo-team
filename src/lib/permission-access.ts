export const PERMISSION_HEAD_EMAIL = "hrdirector@lyceumalabang.edu.ph";

export type PermissionRole = "employee" | "director";

/** Account for the current Permission Slip session, scoped to that system. */
export interface PermissionViewer {
  id: string;
  name: string;
  email: string;
  role: PermissionRole;
  department: string;
}

/**
 * Every LOA system signs in with the same institutional account, but powers are
 * per system. In the Permission Slip system the designated HRDO director is the
 * only approver; everybody else signs in as an ordinary employee.
 */
export function permissionRoleFor(account: { email: string; role: string }): PermissionRole {
  return account.email.trim().toLowerCase() === PERMISSION_HEAD_EMAIL ||
    account.role === "department_head"
    ? "director"
    : "employee";
}

export function isPermissionHead(viewer: PermissionViewer | null | undefined) {
  return viewer?.role === "director";
}
