import { describe, expect, it } from "vitest";
import {
  analyticsPathSchema,
  approveSchema,
  emailDomainAllowed,
  institutionalEmailAllowed,
  normalizePhilippineMobileNumber,
  passwordIssues,
  createAssistantAccountSchema,
  createMainSignatoryAccountSchema,
  mainSignatoriesSchema,
  registrationOtpSchema,
  requestInputSchema,
  resetUserPasswordSchema,
  sendTripTicketSchema,
  signatoryAssistantsSchema,
  tripArchiveFilterSchema,
} from "@/lib/validation";

describe("sendTripTicketSchema", () => {
  const png = `data:image/png;base64,${"A".repeat(200)}`;

  it("accepts a PNG data URL for a request id", () => {
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    expect(sendTripTicketSchema.safeParse({ id, image: png }).success).toBe(true);
  });

  it("rejects non-PNG images", () => {
    const jpg = `data:image/jpeg;base64,${"A".repeat(200)}`;
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    expect(sendTripTicketSchema.safeParse({ id, image: jpg }).success).toBe(false);
  });

  it("rejects a missing id", () => {
    expect(sendTripTicketSchema.safeParse({ image: png }).success).toBe(false);
  });
});

const validInput = {
  department: "College of Arts and Sciences",
  destinations: ["Manila"],
  passengers: 10,
  dateStart: "2026-11-01",
  dateEnd: "2026-11-01",
  timeNeeded: "07:30",
  purpose: "Field trip for the class",
};

describe("password policy", () => {
  it("rejects short or single-class passwords", () => {
    expect(passwordIssues("short")).toEqual(
      expect.arrayContaining([
        "at least 12 characters",
        "an upper-case letter",
        "a number",
        "a symbol",
      ]),
    );
  });

  it("accepts a strong passphrase", () => {
    expect(passwordIssues("PFMO-trip-2026!")).toEqual([]);
  });
});

describe("request input validation", () => {
  it("accepts a complete request", () => {
    expect(requestInputSchema.safeParse(validInput).success).toBe(true);
  });

  describe("Philippine mobile number normalization", () => {
    it.each([
      ["09123456789", "09123456789"],
      ["0912 345 6789", "09123456789"],
      ["(0912) 345-6789", "09123456789"],
      ["+63 912 345 6789", "+639123456789"],
      ["639123456789", "+639123456789"],
      ["9123456789", "09123456789"],
    ])("normalizes %s to %s", (input, expected) => {
      expect(normalizePhilippineMobileNumber(input)).toBe(expected);
    });

    it("rejects invalid numbers and preserves an empty optional value", () => {
      expect(normalizePhilippineMobileNumber("")).toBe("");
      expect(normalizePhilippineMobileNumber("12345")).toBeNull();
      expect(normalizePhilippineMobileNumber("0912abc6789")).toBeNull();
    });
  });

  it("rejects an end date before the start date", () => {
    const result = requestInputSchema.safeParse({ ...validInput, dateEnd: "2026-10-31" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid time, empty destinations and excessive passengers", () => {
    expect(requestInputSchema.safeParse({ ...validInput, timeNeeded: "25:00" }).success).toBe(
      false,
    );
    expect(requestInputSchema.safeParse({ ...validInput, destinations: [] }).success).toBe(false);
    expect(requestInputSchema.safeParse({ ...validInput, passengers: 61 }).success).toBe(false);
  });

  it("rejects control characters in free text", () => {
    expect(
      requestInputSchema.safeParse({ ...validInput, purpose: "Trip\u0000with control" }).success,
    ).toBe(false);
  });
});

describe("signatory assistant validation", () => {
  it("accepts blank names and trims configured names", () => {
    const result = signatoryAssistantsSchema.safeParse({
      review: { name: "  Alex Assistant ", userId: null },
      recommend: { name: "", userId: null },
      approve: { name: "", userId: null },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        review: { name: "Alex Assistant", userId: null },
        recommend: { name: "", userId: null },
        approve: { name: "", userId: null },
      });
    }
  });

  it("accepts explicitly unassigned stages when one assistant is assigned", () => {
    const result = signatoryAssistantsSchema.safeParse({
      review: { name: "", userId: null },
      recommend: { name: "", userId: null },
      approve: {
        name: "Mailyn Duelas Obena",
        userId: "1d1d19d1-062c-4dd1-846d-27797f7d3c75",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.review.userId).toBeNull();
      expect(result.data.recommend.userId).toBeNull();
      expect(result.data.approve.userId).toBe("1d1d19d1-062c-4dd1-846d-27797f7d3c75");
    }
  });

  it("rejects names longer than the database limit", () => {
    expect(
      signatoryAssistantsSchema.safeParse({
        review: { name: "A".repeat(121), userId: null },
        recommend: { name: "", userId: null },
        approve: { name: "", userId: null },
      }).success,
    ).toBe(false);
  });
});

describe("assistant account validation", () => {
  it("accepts account details without a selectable role", () => {
    expect(
      createAssistantAccountSchema.safeParse({
        name: "Alex Assistant",
        email: "alex@loa.edu.ph",
        department: "Transport Services",
      }).success,
    ).toBe(true);
    expect(
      createAssistantAccountSchema.safeParse({
        name: "Alex Assistant",
        email: "alex@loa.edu.ph",
        department: "Transport Services",
        role: "admin",
      }).success,
    ).toBe(true);
  });
});

describe("main signatory management validation", () => {
  it("normalizes unassigned stages and validates selected account ids", () => {
    const result = mainSignatoriesSchema.safeParse({
      review: null,
      recommend: "1d1d19d1-062c-4dd1-846d-27797f7d3c75",
      approve: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        review: null,
        recommend: "1d1d19d1-062c-4dd1-846d-27797f7d3c75",
        approve: null,
      });
    }
  });

  it("only allows main approval stages for new main signatory accounts", () => {
    const account = {
      name: "Alex Signatory",
      email: "alex@lyceumalabang.edu.ph",
      department: "Administration",
    };
    expect(
      createMainSignatoryAccountSchema.safeParse({ ...account, stage: "approve" }).success,
    ).toBe(true);
    expect(createMainSignatoryAccountSchema.safeParse({ ...account, stage: "admin" }).success).toBe(
      false,
    );
  });
});

describe("driver assignment validation", () => {
  const signature = {
    image: `data:image/png;base64,${"A".repeat(200)}`,
    method: "drawn",
  };

  it("accepts an optional assigned driver name during approval", () => {
    expect(
      approveSchema.safeParse({
        id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        signature,
        driverName: "Assigned Driver",
      }).success,
    ).toBe(true);
    expect(
      approveSchema.safeParse({
        id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        signature,
        driverName: "D".repeat(121),
      }).success,
    ).toBe(false);
  });
});

describe("admin password reset validation", () => {
  it("accepts a user ID and rejects malformed IDs", () => {
    expect(
      resetUserPasswordSchema.safeParse({
        userId: "1d1d19d1-062c-4dd1-846d-27797f7d3c75",
      }).success,
    ).toBe(true);
    expect(resetUserPasswordSchema.safeParse({ userId: "not-a-user-id" }).success).toBe(false);
  });
});

describe("institutional email domains", () => {
  it("only allows the configured domains", () => {
    expect(emailDomainAllowed("staff@loa.edu.ph", ["loa.edu.ph"])).toBe(true);
    expect(emailDomainAllowed("staff@lyceumalabang.edu.ph", ["lyceumalabang.edu.ph"])).toBe(true);
    expect(emailDomainAllowed("someone@example.com", ["loa.edu.ph"])).toBe(false);
  });

  describe("registration OTP validation", () => {
    it("accepts a six-digit code for a valid email", () => {
      expect(
        registrationOtpSchema.safeParse({
          email: "staff@lyceumalabang.edu.ph",
          code: "004291",
        }).success,
      ).toBe(true);
    });

    it("rejects malformed codes and non-institutional email addresses", () => {
      expect(
        registrationOtpSchema.safeParse({
          email: "staff@lyceumalabang.edu.ph",
          code: "4291",
        }).success,
      ).toBe(false);
      expect(
        registrationOtpSchema.safeParse({ email: "staff@gmail.com", code: "004291" }).success,
      ).toBe(false);
    });
  });

  it("allows requisitioner self-registration only for the Lyceum domain", () => {
    expect(institutionalEmailAllowed("staff@lyceumalabang.edu.ph")).toBe(true);
    expect(institutionalEmailAllowed("STAFF@LYCEUMALABANG.EDU.PH")).toBe(true);
    expect(institutionalEmailAllowed("staff@loa.edu.ph")).toBe(false);
    expect(institutionalEmailAllowed("staff@example.com")).toBe(false);
    expect(institutionalEmailAllowed("staff@lyceumalabang.edu.ph.example.com")).toBe(false);
  });
});

describe("analytics paths", () => {
  it("accepts grouped paths and rejects query strings", () => {
    expect(analyticsPathSchema.safeParse("/requests/:id").success).toBe(true);
    expect(analyticsPathSchema.safeParse("/dashboard").success).toBe(true);
    expect(analyticsPathSchema.safeParse("/requests?q=secret").success).toBe(false);
  });

  describe("trip archive filters", () => {
    it("accepts date ranges, search, and pagination", () => {
      expect(
        tripArchiveFilterSchema.safeParse({
          q: "Festival Mall",
          from: "2026-10-01",
          to: "2026-10-23",
          page: 2,
        }).success,
      ).toBe(true);
    });

    it("rejects reversed date ranges and invalid page numbers", () => {
      expect(
        tripArchiveFilterSchema.safeParse({
          from: "2026-10-24",
          to: "2026-10-23",
          page: 0,
        }).success,
      ).toBe(false);
      expect(tripArchiveFilterSchema.safeParse({ page: -1 }).success).toBe(false);
      expect(
        tripArchiveFilterSchema.safeParse({ from: "2026-13-45", to: "2026-10-23" }).success,
      ).toBe(false);
    });
  });
});
