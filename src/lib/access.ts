import type { Role, User } from "./types";

/**
 * Pure access-control rules. These are used by the server before every read or
 * write; the UI only uses them to hide actions it already cannot perform.
 * Never treat a client-side check as authorization.
 */

export const APPROVER_ROLES: Role[] = ["transport_head", "director", "president"];

const ALL_REQUEST_ROLES: Role[] = [
  "transport_head",
  "director",
  "president",
  "transport_staff",
  "assistant",
  "guard",
  "driver",
];

export function isApproverRole(role: Role) {
  return APPROVER_ROLES.includes(role);
}
export function canAccessAdminPortal(role: Role, isSuperAdmin = false) {
  return isSuperAdmin || role === "admin";
}
export function canSubmitRequests(role: Role) {
  return role === "requisitioner";
}
export function canViewAllRequests(role: Role, isSuperAdmin = false) {
  return !canAccessAdminPortal(role, isSuperAdmin) && ALL_REQUEST_ROLES.includes(role);
}

export function canViewRequest(
  user: Pick<User, "id" | "role"> & { isSuperAdmin?: boolean },
  requisitionerId: string,
) {
  if (canAccessAdminPortal(user.role, user.isSuperAdmin)) return false;
  if (user.role === "requisitioner") return user.id === requisitionerId;
  return canViewAllRequests(user.role);
}

export function canManageVehicles(role: Role, isSuperAdmin = false) {
  return (
    !canAccessAdminPortal(role, isSuperAdmin) &&
    (role === "transport_head" || role === "transport_staff")
  );
}
export function canActOnStage(role: Role, stageRole: Role) {
  return role === stageRole;
}

export function canViewSiteAnalytics(role: Role, isSuperAdmin = false) {
  return isSuperAdmin || role === "admin";
}
