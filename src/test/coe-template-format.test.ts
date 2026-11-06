import { describe, expect, it } from "vitest";
import { compensationAmountToWords, coeRequestsCompensation } from "@/lib/hrdo";

describe("COE template layout", () => {
  describe("COE compensation amount in words", () => {
    it("converts pesos, comma-formatted values, and centavos", () => {
      expect(compensationAmountToWords("1")).toBe("One Peso Only");
      expect(compensationAmountToWords("1,234")).toBe(
        "One Thousand Two Hundred Thirty Four Pesos Only",
      );
      expect(compensationAmountToWords("₱25,000.50")).toBe(
        "Twenty Five Thousand Pesos and 50/100 Only",
      );
      expect(compensationAmountToWords("0")).toBe("Zero Pesos Only");
    });
    it("does not produce words for empty, malformed, or unsupported values", () => {
      expect(compensationAmountToWords("")).toBe("");
      expect(compensationAmountToWords("12,34")).toBe("");
      expect(compensationAmountToWords("-100")).toBe("");
      expect(compensationAmountToWords("1,000.999")).toBe("");
      expect(compensationAmountToWords("1,000,000,000,000")).toBe("");
    });
  });

  it("includes compensation when explicitly selected in the request description", () => {
    expect(
      coeRequestsCompensation(
        "Requestor type: Internal Employee | Description: Certificate of Employment",
      ),
    ).toBe(false);
    expect(
      coeRequestsCompensation(
        "Requestor type: Internal Employee | Description: Certificate of Employment, With compensation review",
      ),
    ).toBe(true);
    expect(
      coeRequestsCompensation(
        "Requestor type: Third-Party Verifier | Description: With compensation review",
      ),
    ).toBe(true);
  });

  it("does not enable compensation because the free-text note mentions it", () => {
    expect(
      coeRequestsCompensation(
        "Please include compensation information. | Requestor type: Internal Employee | Description: Certificate of Employment",
      ),
    ).toBe(false);
  });
});
