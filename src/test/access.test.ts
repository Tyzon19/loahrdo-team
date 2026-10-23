import { describe, expect, it } from "vitest";
import {
  canManageVehicles,
  canSubmitRequests,
  canViewAllRequests,
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
      "admin",
    ] as Role[]) {
      expect(canViewAllRequests(role)).toBe(true);
      expect(canViewRequest(user(role), "someone-else")).toBe(true);
    }
  });

  it("keeps request submission and fleet management role-specific", () => {
    expect(canSubmitRequests("requisitioner")).toBe(true);
    for (const role of ["director", "president", "assistant", "guard", "driver", "admin"] as Role[]) {
      expect(canSubmitRequests(role)).toBe(false);
    }
    expect(canManageVehicles("transport_head")).toBe(true);
    expect(canManageVehicles("transport_staff")).toBe(true);
    expect(canManageVehicles("assistant")).toBe(false);
    expect(canManageVehicles("requisitioner")).toBe(false);
    expect(canManageVehicles("director")).toBe(false);
  });
});
