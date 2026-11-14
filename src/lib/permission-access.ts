import { canAccessAdminPortal } from "./access";
import type { Role } from "./types";

export const PERMISSION_HEAD_EMAIL = "hrdirector@lyceumalabang.edu.ph";

export type PermissionRole = "employee" | "director";

/** Account for the current Permission Slip session, scoped to that system. */
export interface PermissionViewer {
  id: string;
  name: string;
  email: string;
  role: PermissionRole;
  department: string;
  mustChangePassword?: boolean;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
}

export function permissionViewerForAdminPortal(
  user:
    | {
        id: string;
        name: string;
        email: string;
        role: Role;
        department: string;
        isSuperAdmin: boolean;
      }
    | null
    | undefined,
): PermissionViewer | null {
  if (!user || !canAccessAdminPortal(user.role, user.isSuperAdmin)) return null;
  return {
    ...user,
    role: permissionRoleFor(user),
    isAdmin: user.role === "admin",
    isSuperAdmin: user.isSuperAdmin,
  };
}

/**
 * Every LOA system signs in with the same institutional account, but powers are
 * per system. Permission Slip approval is limited to accounts assigned as
 * signatories for that system.
 */
export function permissionRoleFor(account: {
  email: string;
  role: string;
  isPermissionSignatory?: boolean;
}): PermissionRole {
  return account.isPermissionSignatory ? "director" : "employee";
}

export function canManagePermissionSignatories(
  viewer: Pick<PermissionViewer, "isSuperAdmin"> | null | undefined,
) {
  return viewer?.isSuperAdmin === true;
}

export function isPermissionHead(viewer: PermissionViewer | null | undefined) {
  return viewer?.role === "director";
}

export function canViewPermissionQueue(viewer: PermissionViewer | null | undefined) {
  return isPermissionHead(viewer) || Boolean(viewer?.isAdmin || viewer?.isSuperAdmin);
}
