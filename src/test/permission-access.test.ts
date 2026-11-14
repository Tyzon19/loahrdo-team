import { describe, expect, it } from "vitest";
import {
  isPermissionHead,
  canViewPermissionQueue,
  permissionRoleFor,
  permissionViewerForAdminPortal,
  PERMISSION_HEAD_EMAIL,
  canManagePermissionSignatories,
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
    expect(
      permissionRoleFor({
        email: PERMISSION_HEAD_EMAIL,
        role: "requisitioner",
        isPermissionSignatory: true,
      }),
    ).toBe("director");
    expect(
      permissionRoleFor({
        email: PERMISSION_HEAD_EMAIL,
        role: "requisitioner",
        isPermissionSignatory: false,
      }),
    ).toBe("employee");
    expect(
      permissionRoleFor({
        email: "new.signer@lyceumalabang.edu.ph",
        role: "requisitioner",
        isPermissionSignatory: true,
      }),
    ).toBe("director");
    expect(
      permissionRoleFor({
        email: "employee@lyceumalabang.edu.ph",
        role: "requisitioner",
        isPermissionSignatory: false,
      }),
    ).toBe("employee");
  });

  it("allows only Super Admins to manage Permission Slip signatories", () => {
    expect(canManagePermissionSignatories({ isSuperAdmin: true })).toBe(true);
    expect(canManagePermissionSignatories({ isSuperAdmin: false })).toBe(false);
    expect(canManagePermissionSignatories(null)).toBe(false);
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

  it("lets module Admins and Super Admins view the queue without granting approval", () => {
    const moduleAdmin = viewer({ role: "employee", isAdmin: true });
    const superAdmin = viewer({ role: "employee", isSuperAdmin: true });

    expect(canViewPermissionQueue(moduleAdmin)).toBe(true);
    expect(canViewPermissionQueue(superAdmin)).toBe(true);
    expect(isPermissionHead(moduleAdmin)).toBe(false);
    expect(isPermissionHead(superAdmin)).toBe(false);
    expect(canViewPermissionQueue(viewer({ role: "employee" }))).toBe(false);
  });

  it("maps central admins to read-only Permission Slip access", () => {
    const adminViewer = permissionViewerForAdminPortal({
      id: "admin",
      name: "System Admin",
      email: "admin@lyceumalabang.edu.ph",
      role: "admin",
      department: "Administration",
      isSuperAdmin: false,
    });

    expect(adminViewer?.isAdmin).toBe(true);
    expect(canViewPermissionQueue(adminViewer)).toBe(true);
    expect(isPermissionHead(adminViewer)).toBe(false);
    expect(
      permissionViewerForAdminPortal({
        id: "employee",
        name: "Employee",
        email: "employee@lyceumalabang.edu.ph",
        role: "requisitioner",
        department: "Administration",
        isSuperAdmin: false,
      }),
    ).toBe(null);

    const rootViewer = permissionViewerForAdminPortal({
      id: "root",
      name: "Super Admin",
      email: "root@lyceumalabang.edu.ph",
      role: "requisitioner",
      department: "Administration",
      isSuperAdmin: true,
    });

    expect(rootViewer?.isSuperAdmin).toBe(true);
    expect(canViewPermissionQueue(rootViewer)).toBe(true);
    expect(isPermissionHead(rootViewer)).toBe(false);
  });
});
