import type { RowDataPacket } from "mysql2/promise";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { all } from "@/server/db";
import { requireViewer } from "@/server/auth";
import { listAdminOperationsOverview, listSuperAdminOverview } from "@/server/system-access";

vi.mock("@/server/db", () => ({ all: vi.fn(), run: vi.fn(), withTransaction: vi.fn() }));
vi.mock("@/server/auth", () => ({ requireViewer: vi.fn() }));

describe("Super Admin overview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("summarizes system totals, modules, recent users, and access activity", async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Portal Admin",
      email: "admin@lyceumalabang.edu.ph",
      role: "admin",
      department: "Administration",
      mustChangePassword: false,
      needsProfileCompletion: false,
      isSuperAdmin: true,
    });
    vi.mocked(all)
      .mockResolvedValueOnce([{ total: 45, active: 40 }] as RowDataPacket[])
      .mockResolvedValueOnce([{ total: 38 }] as RowDataPacket[])
      .mockResolvedValueOnce([{ pending: 7, completed: 12, rejected: 2 }] as RowDataPacket[])
      .mockResolvedValueOnce([{ pending: 3, completed: 5, rejected: 1 }] as RowDataPacket[])
      .mockResolvedValueOnce([{ pending: 4, completed: 8, rejected: 1 }] as RowDataPacket[])
      .mockResolvedValueOnce([] as RowDataPacket[])
      .mockResolvedValueOnce([] as RowDataPacket[]);

    await expect(listSuperAdminOverview()).resolves.toMatchObject({
      totals: {
        employees: 38,
        users: 45,
        activeUsers: 40,
        pending: 14,
        completed: 25,
        rejected: 4,
      },
      modules: {
        transportation: { pending: 7, completed: 12, rejected: 2 },
        coe: { pending: 3, completed: 5, rejected: 1 },
        permissionSlip: { pending: 4, completed: 8, rejected: 1 },
      },
    });
  });

  it("summarizes Admin / HR operations across existing modules", async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      name: "HR Admin",
      email: "hradmin@lyceumalabang.edu.ph",
      role: "admin",
      department: "Human Resources",
      mustChangePassword: false,
      needsProfileCompletion: false,
      isSuperAdmin: false,
    });
    vi.mocked(all)
      .mockResolvedValueOnce([{ total: 38 }] as RowDataPacket[])
      .mockResolvedValueOnce([
        {
          total: 20,
          pending: 7,
          forApproval: 3,
          approved: 5,
          rejected: 2,
          completed: 6,
        },
      ] as RowDataPacket[])
      .mockResolvedValueOnce([
        {
          total: 12,
          pending: 4,
          forApproval: 2,
          approved: 3,
          rejected: 1,
          completed: 3,
        },
      ] as RowDataPacket[])
      .mockResolvedValueOnce([
        {
          total: 9,
          pending: 3,
          forApproval: 3,
          approved: 4,
          rejected: 1,
          completed: 4,
        },
      ] as RowDataPacket[])
      .mockResolvedValueOnce([{ openFlags: 2 }] as RowDataPacket[]);

    await expect(listAdminOperationsOverview()).resolves.toMatchObject({
      employees: 38,
      totals: {
        transportation: { total: 20, pending: 7, completed: 6, rejected: 2 },
        coe: { total: 12, pending: 4, completed: 3, rejected: 1 },
        permissionSlip: { total: 9, pending: 3, completed: 4, rejected: 1 },
        lateAbsences: { pending: 2 },
      },
    });
  });
});
