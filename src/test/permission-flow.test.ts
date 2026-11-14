import { describe, expect, it } from "vitest";
import {
  approvePermissionSchema,
  createPermissionSignatorySchema,
  createPermissionSchema,
  permissionSignatoryIdSchema,
  sendPermissionReceiptSchema,
} from "@/lib/permission-schema";
import { fmtTime } from "@/lib/format";

describe("Permission Slip Approval & Receipt Schemas", () => {
  const dummySignature =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  it("validates createPermissionSchema with valid date, times, reason and signature", () => {
    const valid = createPermissionSchema.safeParse({
      department: "College of Computer Studies",
      requestedDate: "2026-11-12",
      timeOut: "10:30",
      timeIn: "14:00",
      reason: "Official school errand at Department of Education",
      employeeSignature: dummySignature,
    });

    expect(valid.success).toBe(true);
  });

  it("rejects createPermissionSchema when the department is missing", () => {
    const invalid = createPermissionSchema.safeParse({
      department: "",
      requestedDate: "2026-11-12",
      timeOut: "10:30",
      timeIn: "14:00",
      reason: "Official school errand at Department of Education",
      employeeSignature: dummySignature,
    });
    expect(invalid.success).toBe(false);
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

  it("formats receipt times using Philippine 12-hour notation", () => {
    expect(fmtTime("00:05")).toBe("12:05 AM");
    expect(fmtTime("10:30")).toBe("10:30 AM");
    expect(fmtTime("14:00")).toBe("2:00 PM");
    expect(fmtTime("23:45")).toBe("11:45 PM");
  });
});

describe("Permission Slip signatory management schemas", () => {
  it("accepts institutional signatory accounts and rejects non-institutional emails", () => {
    const account = {
      name: "Alex Signatory",
      email: "alex.signatory@lyceumalabang.edu.ph",
      department: "Human Resources Development Office",
    };
    expect(createPermissionSignatorySchema.safeParse(account).success).toBe(true);
    expect(
      createPermissionSignatorySchema.safeParse({
        ...account,
        email: "alex@example.com",
      }).success,
    ).toBe(false);
  });

  it("requires a UUID when removing signatory access", () => {
    expect(
      permissionSignatoryIdSchema.safeParse("2a2a95a1-7916-4baf-8d00-3682eec149b5").success,
    ).toBe(true);
    expect(permissionSignatoryIdSchema.safeParse("not-a-uuid").success).toBe(false);
  });
});
