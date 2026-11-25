import { describe, expect, it } from "vitest";
import {
  canManageVehicles,
  canSubmitRequests,
  canActOnStage,
  canAccessAdminPortal,
  canViewAllRequests,
  canViewSiteAnalytics,
  canViewRequest,
} from "@/lib/access";
import type { Role } from "@/lib/types";

const user = (role: Role) => ({ id: "u1", role });

describe("access rules", () => {
  it("lets a requisitioner see only their own requests", () => {
    expect(canViewRequest(user("requisitioner"), "u1")).toBe(true);
    expect(canViewRequest(user("requisitioner"), "u2")).toBe(false);
  });

  it("lets approvers and operational staff see the request queue", () => {
    for (const role of [
      "transport_head",
      "director",
      "president",
      "transport_staff",
      "assistant",
      "guard",
      "driver",
    ] as Role[]) {
      expect(canViewAllRequests(role)).toBe(true);
      expect(canViewRequest(user(role), "someone-else")).toBe(true);
    }
  });

  it("keeps request submission and fleet management role-specific", () => {
    expect(canSubmitRequests("requisitioner")).toBe(true);
    for (const role of [
      "director",
      "president",
      "assistant",
      "guard",
      "driver",
      "admin",
    ] as Role[]) {
      expect(canSubmitRequests(role)).toBe(false);
    }
    expect(canManageVehicles("transport_head")).toBe(true);
    expect(canManageVehicles("transport_staff")).toBe(true);
    expect(canManageVehicles("assistant")).toBe(false);
    expect(canManageVehicles("requisitioner")).toBe(false);
    expect(canManageVehicles("director")).toBe(false);
  });

  it("keeps Admin and Super Admin in the portal, not the vehicle workflow", () => {
    const rootViewer = { id: "root", role: "requisitioner" as const, isSuperAdmin: true };

    expect(canAccessAdminPortal(rootViewer.role, rootViewer.isSuperAdmin)).toBe(true);
    expect(canViewAllRequests(rootViewer.role, rootViewer.isSuperAdmin)).toBe(false);
    expect(canViewRequest(rootViewer, "someone-else")).toBe(false);
    expect(canManageVehicles(rootViewer.role, rootViewer.isSuperAdmin)).toBe(false);
    expect(canViewAllRequests("admin")).toBe(false);
    expect(canViewRequest(user("admin"), "someone-else")).toBe(false);
    expect(canManageVehicles("admin")).toBe(false);
    expect(canActOnStage(rootViewer.role, "transport_head")).toBe(false);
    expect(canViewSiteAnalytics(rootViewer.role, rootViewer.isSuperAdmin)).toBe(true);
  });

  it("allows central Admins into the portal without granting it to ordinary employees", () => {
    expect(canAccessAdminPortal("admin")).toBe(true);
    expect(canAccessAdminPortal("requisitioner")).toBe(false);
    expect(canAccessAdminPortal("requisitioner", true)).toBe(true);
  });
});
