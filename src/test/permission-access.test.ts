import { describe, expect, it } from "vitest";
import {
  isPermissionHead,
  permissionRoleFor,
  PERMISSION_HEAD_EMAIL,
  type PermissionViewer,
} from "@/lib/permission-access";

function viewer(overrides: Partial<PermissionViewer> = {}): PermissionViewer {
  return {
    id: "8d1f2f58-6a1b-4f2e-9c6f-1f0d2f0a9b11",
    name: "HRDO Director",
    email: PERMISSION_HEAD_EMAIL,
    role: "director",
    department: "Human Resources Development Office",
    ...overrides,
  };
}

describe("Permission Slip access", () => {
  it("gives the designated HRDO director approval powers in this system", () => {
    expect(permissionRoleFor({ email: PERMISSION_HEAD_EMAIL, role: "department_head" })).toBe(
      "director",
    );
    expect(permissionRoleFor({ email: PERMISSION_HEAD_EMAIL, role: "requisitioner" })).toBe(
      "director",
    );
  });

  it("treats every other institutional account as an ordinary employee", () => {
    expect(
      permissionRoleFor({
        email: "transport.head@lyceumalabang.edu.ph",
        role: "transport_head",
      }),
    ).toBe("employee");
    expect(
      permissionRoleFor({ email: "employee@lyceumalabang.edu.ph", role: "requisitioner" }),
    ).toBe("employee");
  });

  it("only the director profile can review slips", () => {
    expect(isPermissionHead(viewer())).toBe(true);
    expect(isPermissionHead(viewer({ role: "employee" }))).toBe(false);
    expect(isPermissionHead(null)).toBe(false);
  });
});
