import { beforeEach, describe, expect, it, vi } from "vitest";
import { all, run } from "@/server/db";
import { viewer } from "@/server/auth";
import { requirePermissionViewer } from "@/server/permission/auth";
import { persistPermissionSlipReceipt } from "@/server/permission";

vi.mock("@/server/db", () => ({ all: vi.fn(), run: vi.fn() }));
vi.mock("@/server/auth", () => ({ viewer: vi.fn(), requireViewer: vi.fn() }));
vi.mock("@/server/permission/auth", () => ({ requirePermissionViewer: vi.fn() }));
vi.mock("@/server/gmail", () => ({
  sendPermissionSlipEmail: vi.fn(),
  sendTemporaryPasswordEmail: vi.fn(),
}));

describe("Permission Slip receipt archiving", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows a Super Admin receipt archive from the central receipts page", async () => {
    vi.mocked(viewer).mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Super Admin",
      email: "admin@lyceumalabang.edu.ph",
      role: "admin",
      department: "Administration",
      mustChangePassword: false,
      needsProfileCompletion: false,
      isSuperAdmin: true,
    });
    vi.mocked(requirePermissionViewer).mockRejectedValue(
      new Error("A Permission Slip session is required."),
    );
    vi.mocked(all)
      .mockResolvedValueOnce([
        {
          id: "33333333-3333-4333-8333-333333333333",
          employee_id: "44444444-4444-4444-8444-444444444444",
          employee_name: "MS. Kristine Mae L. Merdegia",
          employee_email: "employee@lyceumalabang.edu.ph",
          department: "Administration",
          requested_date: "2026-11-13",
          time_out: "14:00",
          time_in: "16:00",
          reason: "Official business",
          employee_signature: "data:image/png;base64,signature",
          status: "approved",
          department_head_id: null,
          department_head_name: "Signatory",
          department_head_signature: "data:image/png;base64,signature",
          rejection_reason: null,
          requested_at: "2026-11-13 06:00:00",
          approved_at: "2026-11-13 08:00:00",
          rejected_at: null,
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(
      persistPermissionSlipReceipt({
        id: "33333333-3333-4333-8333-333333333333",
        receiptImage: "data:image/png;base64,aW1hZ2U=",
      }),
    ).resolves.toEqual({ ok: true });
    expect(run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE permission_slips SET receipt_image"),
      expect.any(Array),
    );
  });
});
