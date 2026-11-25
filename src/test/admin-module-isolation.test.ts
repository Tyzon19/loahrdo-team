import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCookie } from "@tanstack/react-start/server";
import { all } from "@/server/db";
import { requireTransportViewer } from "@/server/auth";
import { hrdoLogin, hrdoViewer, ensureHrdoGoogleAccount } from "@/server/hrdo/auth";
import { permissionLogin, permissionViewer } from "@/server/permission/auth";
import { listRequests } from "@/server/requests";

vi.mock("@tanstack/react-start/server", () => ({
  getCookie: vi.fn(),
  deleteCookie: vi.fn(),
  getRequestHeader: vi.fn(),
  getRequestIP: vi.fn(),
  setCookie: vi.fn(),
}));
vi.mock("@/server/db", () => ({ all: vi.fn(), run: vi.fn(), withTransaction: vi.fn() }));

const admin = (role: "admin" | "requisitioner", isSuperAdmin: number) => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Portal Admin",
  email: "admin@lyceumalabang.edu.ph",
  password_hash: "hash",
  role,
  department: "Administration",
  must_change_password: 0,
  profile_complete: 1,
  is_super_admin: isSuperAdmin,
});

describe("admin module isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  for (const [role, isSuperAdmin] of [
    ["admin", 0],
    ["requisitioner", 1],
  ] as const) {
    it(`blocks ${isSuperAdmin ? "Super Admin" : "Admin"} from transport APIs and module sessions`, async () => {
      vi.mocked(getCookie).mockImplementation((name) =>
        name === "loa_session" ? "a".repeat(43) : undefined,
      );
      vi.mocked(all).mockResolvedValue([admin(role, isSuperAdmin)] as never);

      await expect(requireTransportViewer()).rejects.toThrow(
        "cannot access the Vehicle Trip Ticket",
      );
      await expect(listRequests({})).rejects.toThrow("cannot access the Vehicle Trip Ticket");
      await expect(hrdoViewer()).resolves.toBeNull();
      await expect(permissionViewer()).resolves.toBeNull();
    });

    it(`rejects ${isSuperAdmin ? "Super Admin" : "Admin"} module logins without a main session`, async () => {
      vi.mocked(getCookie).mockReturnValue(undefined);
      vi.mocked(all).mockResolvedValue([{ role, is_super_admin: isSuperAdmin }] as never);
      const credentials = { email: "admin@lyceumalabang.edu.ph", password: "valid-password" };

      await expect(hrdoLogin(credentials)).rejects.toThrow("main header login");
      await expect(permissionLogin(credentials)).rejects.toThrow("main header login");
      await expect(ensureHrdoGoogleAccount(credentials.email)).rejects.toThrow("main header login");
    });
  }
});
