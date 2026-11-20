import { describe, expect, it } from "vitest";
import { attendanceSheetNameMatchesUserName, parseStaffMatrix } from "@/lib/late-absences";

describe("late and absences sheet matrix", () => {
  it("maps the June-to-May cycle and supported codes to dated events", () => {
    const values = Array.from({ length: 9 }, () => Array<string>(370).fill(""));
    values[0]![0] = "6";
    values[1]![0] = "2026";
    values[0]![366] = "Leaves This Month";
    values[0]![367] = "Leaves This Year";
    values[0]![368] = "TOTAL EL";
    values[0]![369] = "B/L";
    values[7]![0] = "ADOLFO, STEPHANIE JOY A.";
    values[7]![1] = "S";
    values[7]![2] = "LATE";
    values[7]![366] = "1";
    values[7]![367] = "2";
    values[7]![368] = "5";
    values[7]![369] = "2";

    const result = parseStaffMatrix(values);
    expect(result.cycleStart).toBe("2026-06-01");
    expect(result.cycleEnd).toBe("2027-05-31");
    expect(result.rows[0]?.logs).toEqual([
      expect.objectContaining({ incidentDate: "2026-06-01", code: "S", creditedDays: 1 }),
      expect.objectContaining({ incidentDate: "2026-06-02", code: "LATE", creditedDays: 0 }),
    ]);
    expect(result.rows[0]?.balance).toMatchObject({
      leavesThisMonth: 1,
      leavesThisYear: 2,
      remEl: 5,
      remBl: 2,
      totalLates: 1,
    });
  });

  it("ignores unsupported values and empty employee rows", () => {
    const values = Array.from({ length: 10 }, () => Array<string>(10).fill(""));
    values[0]![0] = "6";
    values[1]![0] = "2026";
    values[7]![0] = "EMPLOYEE, TEST";
    values[7]![1] = "holiday";
    values[8]![0] = "";
    expect(parseStaffMatrix(values).rows).toHaveLength(1);
    expect(parseStaffMatrix(values).rows[0]?.logs).toHaveLength(0);
  });

  it("matches a registration name to the surname-first staff sheet format", () => {
    expect(
      attendanceSheetNameMatchesUserName("ADOLFO, STEPHANIE JOY A.", "Stephanie Joy Adolfo"),
    ).toBe(true);
  });

  it("requires a unique surname, first name, and middle initial match", () => {
    expect(attendanceSheetNameMatchesUserName("SANTOS, JUAN MIGUEL C.", "Juan Carlo Santos")).toBe(
      false,
    );
  });
});
