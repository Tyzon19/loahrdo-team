import { describe, expect, it } from "vitest";
import {
  approvePermissionSchema,
  createPermissionSchema,
  sendPermissionReceiptSchema,
} from "@/lib/permission-schema";

describe("Permission Slip Approval & Receipt Schemas", () => {
  const dummySignature =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  it("validates createPermissionSchema with valid date, times, reason and signature", () => {
    const valid = createPermissionSchema.safeParse({
      requestedDate: "2026-11-12",
      timeOut: "10:30",
      timeIn: "14:00",
      reason: "Official school errand at Department of Education",
      employeeSignature: dummySignature,
    });
    expect(valid.success).toBe(true);
  });

  it("rejects createPermissionSchema when reason is shorter than 5 chars", () => {
    const invalid = createPermissionSchema.safeParse({
      requestedDate: "2026-11-12",
      timeOut: "10:30",
      timeIn: "14:00",
      reason: "bad",
      employeeSignature: dummySignature,
    });
    expect(invalid.success).toBe(false);
  });

  it("validates approvePermissionSchema without requiring email or receiptImage upfront", () => {
    const valid = approvePermissionSchema.safeParse({
      id: "2a2a95a1-7916-4baf-8d00-3682eec149b5",
      signature: dummySignature,
      sendEmail: false,
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.sendEmail).toBe(false);
      expect(valid.data.receiptImage).toBeUndefined();
    }
  });

  it("validates sendPermissionReceiptSchema with base64 receipt png", () => {
    const valid = sendPermissionReceiptSchema.safeParse({
      id: "2a2a95a1-7916-4baf-8d00-3682eec149b5",
      receiptImage: dummySignature,
    });
    expect(valid.success).toBe(true);
  });

  it("rejects invalid id or missing signature", () => {
    const invalidId = approvePermissionSchema.safeParse({
      id: "not-a-uuid",
      signature: dummySignature,
    });
    expect(invalidId.success).toBe(false);

    const missingSig = approvePermissionSchema.safeParse({
      id: "2a2a95a1-7916-4baf-8d00-3682eec149b5",
      signature: "short",
    });
    expect(missingSig.success).toBe(false);
  });
});
