import { beforeEach, describe, expect, it, vi } from "vitest";
import { all } from "@/server/db";
import { requireViewer } from "@/server/auth";
import { getTripArchive } from "@/server/analytics";

vi.mock("@tanstack/react-start/server", () => ({ getRequestIP: vi.fn() }));
vi.mock("@/server/auth", () => ({ requireViewer: vi.fn() }));
vi.mock("@/server/db", () => ({ all: vi.fn(), run: vi.fn() }));

describe("Trip Analytics access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(all).mockResolvedValue([]);
  });
  it.each([
    ["admin", false, true],
    ["requisitioner", true, true],
    ["transport_head", false, false],
  ] as const)(
    "checks the analytics permission for %s (Super Admin: %s)",
    async (role, isSuperAdmin, allowed) => {
      vi.mocked(requireViewer).mockResolvedValue({
        id: "fixture",
        name: "Staff",
        email: "staff@loa.edu.ph",
        department: "College",
        role,
        isSuperAdmin,
        mustChangePassword: false,
        needsProfileCompletion: false,
      });
      if (allowed) await expect(getTripArchive({})).resolves.toMatchObject({ total: 0 });
      else {
        await expect(getTripArchive({})).rejects.toThrow("Only administrators");
        expect(all).not.toHaveBeenCalled();
      }
    },
  );
});
