import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { all } from "@/server/db";
import { requireViewer } from "@/server/auth";
import { getPermissionSlip, type PermissionSlip } from "@/server/permission";
import { getAdminReceiptPreview, listAdminReceipts } from "@/server/admin-receipts";
import type { Viewer } from "@/lib/types";

vi.mock("@/server/db", () => ({ all: vi.fn() }));
vi.mock("@/server/auth", () => ({ requireViewer: vi.fn() }));
vi.mock("@/server/permission", () => ({ getPermissionSlip: vi.fn() }));

function viewer(role: Viewer["role"], isSuperAdmin = false): Viewer {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Portal Admin",
    email: "admin@lyceumalabang.edu.ph",
    role,
    department: "Administration",
    mustChangePassword: false,
    needsProfileCompletion: false,
    isSuperAdmin,
  };
}

describe("Admin receipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies receipt archive access to non-admin accounts", async () => {
    vi.mocked(requireViewer).mockResolvedValue(viewer("requisitioner"));

    await expect(listAdminReceipts({ system: "all", page: 0 })).rejects.toThrow(
      "Only Admins can view system receipts.",
    );
    await expect(
      getAdminReceiptPreview({
        system: "coe",
        id: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toThrow("Only Admins can view system receipts.");
    expect(all).not.toHaveBeenCalled();
  });

  it("allows Super Admins to list receipts", async () => {
    vi.mocked(requireViewer).mockResolvedValue(viewer("requisitioner", true));
    vi.mocked(all).mockResolvedValue([]);

    await expect(listAdminReceipts({ system: "all", page: 0 })).resolves.toMatchObject({
      items: [],
      page: 0,
      hasMore: false,
    });
  });

  it("lists receipts for the selected system and date range", async () => {
    vi.mocked(requireViewer).mockResolvedValue(viewer("admin"));
    const row: RowDataPacket & {
      id: string;
      system: "coe";
      reference: string;
      person_name: string;
      department: string;
      status: string;
      receipt_at_ms: number;
      file_name: string;
    } = {
      constructor: { name: "RowDataPacket" },
      id: "22222222-2222-4222-8222-222222222222",
      system: "coe",
      reference: "COE-22222222",
      person_name: "Employee User",
      department: "Human Resources Development Office",
      status: "released",
      receipt_at_ms: Date.parse("2026-11-12T08:30:00Z"),
      file_name: "certificate.pdf",
    };
    vi.mocked(all).mockResolvedValue([row]);

    const result = await listAdminReceipts({
      system: "coe",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-30",
      page: 0,
    });

    expect(result.items).toEqual([
      {
        id: row.id,
        system: "coe",
        reference: "COE-22222222",
        personName: "Employee User",
        department: "Human Resources Development Office",
        status: "released",
        receiptAt: "2026-11-12T08:30:00.000Z",
        fileName: "certificate.pdf",
      },
    ]);
    expect(result.hasMore).toBe(false);
    expect(all).toHaveBeenCalledWith(
      expect.stringContaining("hrdo_coe_documents"),
      expect.arrayContaining(["2026-11-01", "2026-11-30", 25, 0]),
    );
  });

  it("returns a released COE document only to an admin", async () => {
    vi.mocked(requireViewer).mockResolvedValue(viewer("admin"));
    const content = Buffer.from("%PDF-1.7 receipt");
    const row: RowDataPacket & {
      status: string;
      file_name: string;
      mime: string;
      content: Buffer;
    } = {
      constructor: { name: "RowDataPacket" },
      status: "released",
      file_name: "certificate.pdf",
      mime: "application/pdf",
      content,
    };
    vi.mocked(all).mockResolvedValue([row]);

    await expect(
      getAdminReceiptPreview({
        system: "coe",
        id: "22222222-2222-4222-8222-222222222222",
      }),
    ).resolves.toEqual({
      system: "coe",
      fileName: "certificate.pdf",
      mime: "application/pdf",
      base64: content.toString("base64"),
    });
  });

  it("returns a finalized Vehicle Trip Ticket image for preview", async () => {
    vi.mocked(requireViewer).mockResolvedValue(viewer("admin"));
    const image = Buffer.from("ticket image");
    const row: RowDataPacket & { number: string; mime: string; image: Buffer } = {
      constructor: { name: "RowDataPacket" },
      number: "VTT-2026-001",
      mime: "image/png",
      image,
    };
    vi.mocked(all).mockResolvedValue([row]);

    await expect(
      getAdminReceiptPreview({
        system: "vehicle_trip_ticket",
        id: "22222222-2222-4222-8222-222222222222",
      }),
    ).resolves.toEqual({
      system: "vehicle_trip_ticket",
      fileName: "VTT-2026-001-trip-ticket.png",
      mime: "image/png",
      base64: image.toString("base64"),
    });
  });

  it("does not return a COE document before it is ready for release", async () => {
    vi.mocked(requireViewer).mockResolvedValue(viewer("admin"));
    vi.mocked(all).mockResolvedValue([]);

    await expect(
      getAdminReceiptPreview({
        system: "coe",
        id: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toThrow("Receipt not found.");
  });

  it("returns an approved Permission Slip for its receipt preview", async () => {
    vi.mocked(requireViewer).mockResolvedValue(viewer("admin"));
    const slip: PermissionSlip = {
      id: "33333333-3333-4333-8333-333333333333",
      employeeId: "44444444-4444-4444-8444-444444444444",
      employeeName: "Employee User",
      employeeEmail: "employee@lyceumalabang.edu.ph",
      department: "Administration",
      requestedDate: "2026-11-13",
      timeOut: "14:00",
      timeIn: "16:00",
      reason: "Official business",
      employeeSignature: "data:image/png;base64,",
      status: "approved",
      departmentHeadName: "Signatory User",
      departmentHeadSignature: "data:image/png;base64,",
      requestedAt: "2026-11-13T06:00:00Z",
      approvedAt: "2026-11-13T08:00:00Z",
      history: [],
    };
    vi.mocked(getPermissionSlip).mockResolvedValue(slip);

    await expect(
      getAdminReceiptPreview({ system: "permission_slip", id: slip.id }),
    ).resolves.toEqual({ system: "permission_slip", slip });
  });
});
