import { describe, expect, it } from "vitest";
import {
  annualLeaveCreditAvailabilityError,
  BASE_ALLOCATION,
  type AnnualLeaveBalances,
} from "@/lib/late-absences";
import { attendanceMonths } from "@/lib/attendance";

describe("tracker-authoritative annual leave credits", () => {
  it("uses the sheet balance columns as the source for the 17-day total", () => {
    const balances: AnnualLeaveBalances = { E: 2, S: 5, V: 0, B: 0 };

    expect(BASE_ALLOCATION).toBe(17);
    expect(annualLeaveCreditAvailabilityError("E", 2, balances)).toBeNull();
    expect(annualLeaveCreditAvailabilityError("S", 8, balances)).toContain(
      "only 7.0 remain in the 17-day tracker balance",
    );
  });

  it("blocks a category when its TOTAL balance in the tracker is exhausted", () => {
    const balances: AnnualLeaveBalances = { E: 2, S: 5, V: 0, B: 0 };

    expect(annualLeaveCreditAvailabilityError("V", 1, balances)).toContain(
      "only 0.0 remain in that tracker balance",
    );
    expect(annualLeaveCreditAvailabilityError("B", 1, balances)).toContain(
      "Birthday leave needs 1 days",
    );
  });

  it("does not charge leave types outside the standard 17-day pool", () => {
    const balances: AnnualLeaveBalances = { E: 6, S: 5, V: 5, B: 1 };

    expect(annualLeaveCreditAvailabilityError("SIL", 3, balances)).toBeNull();
  });

  it("lists every month represented in synchronized records, across years", () => {
    expect(attendanceMonths(["2026-11-27", "2027-01-03", "2026-11-28"])).toEqual([
      { value: "2027-01", label: "January 2027" },
      { value: "2026-11", label: "November 2026" },
    ]);
  });
});
