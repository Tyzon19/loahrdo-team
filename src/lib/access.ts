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
  "admin",
];

export function isApproverRole(role: Role) {
  return APPROVER_ROLES.includes(role);
}

/** Requisitioners submit requests; everyone else participates in the workflow. */
export function canSubmitRequests(role: Role) {
  return role === "requisitioner";
}

/** Only these roles may read requests that belong to other people. */
export function canViewAllRequests(role: Role) {
  return ALL_REQUEST_ROLES.includes(role);
}

export function canViewRequest(user: Pick<User, "id" | "role">, requisitionerId: string) {
  if (user.role === "requisitioner") return user.id === requisitionerId;
  return canViewAllRequests(user.role);
}

export function canManageVehicles(role: Role) {
  return role === "transport_head" || role === "transport_staff" || role === "admin";
}

/** The server always re-derives the current stage; this only maps the role. */
export function canActOnStage(role: Role, stageRole: Role) {
  return role === stageRole;
}

export function canViewSiteAnalytics(role: Role) {
  return role === "admin";
}
