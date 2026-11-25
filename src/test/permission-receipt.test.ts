import { beforeEach, describe, expect, it, vi } from "vitest";
import { all, run } from "@/server/db";
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

  it("does not let a central admin archive a Permission Slip without a module signatory session", async () => {
    vi.mocked(requirePermissionViewer).mockRejectedValue(
      new Error("A Permission Slip session is required."),
    );
    await expect(
      persistPermissionSlipReceipt({
        id: "33333333-3333-4333-8333-333333333333",
        receiptImage: "data:image/png;base64,aW1hZ2U=",
      }),
    ).rejects.toThrow("A Permission Slip session is required.");
    expect(all).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
