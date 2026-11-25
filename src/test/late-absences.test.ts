import { describe, expect, it } from "vitest";
import { parseStaffMatrix } from "@/lib/late-absences";
import {
  sheetNameKey,
  normalizeAttendanceName,
  attendanceInstitutionalEmail,
} from "@/lib/attendance";

function grid() {
  const values = Array.from({ length: 10 }, () => Array<string>(395).fill(""));
  values[0]![0] = "6";
  values[1]![0] = "2026";
  values[7]![0] = "ADOLFO, STEPHANIE JOY A.";
  values[7]![373] = "0.5";
  values[7]![374] = "2";
  values[7]![379] = "0";
  values[7]![386] = "4.5";
  values[7]![387] = "5";
  values[7]![388] = "0";
  return values;
}

describe("STAFF's 12 blocks of 31 daily columns", () => {
  it("uses NP's authoritative birthday total, including exclusions and HR adjustments", () => {
    const values = grid();
    values[7]![1] = "B";
    expect(parseStaffMatrix(values).rows[0]!.balance.remBl).toBe(1);
    values[7]![379] = "2";
    values[7]![389] = "3 BL CARRY OVER";
    expect(parseStaffMatrix(values).rows[0]!.balance.remBl).toBe(2);
    values[7]![389] = "";
    expect(parseStaffMatrix(values).rows[0]!.balance.remBl).toBe(0);
  });

  it("maps month boundaries, skips impossible dates and includes May 31", () => {
    const values = grid();
    values[7]![1] = "S";
    values[7]![31] = "V"; // Invalid June 31 must never overflow into July.
    values[7]![32] = "HV";
    values[7]![372] = "HE";
    const result = parseStaffMatrix(values);
    expect(result.cycleStart).toBe("2026-06-01");
    expect(result.cycleEnd).toBe("2027-05-31");
    expect(result.rows[0]?.logs).toEqual([
      expect.objectContaining({ incidentDate: "2026-06-01", code: "S", creditedDays: 1 }),
      expect.objectContaining({ incidentDate: "2026-07-01", code: "HV", creditedDays: 0.5 }),
      expect.objectContaining({ incidentDate: "2027-05-31", code: "HE", creditedDays: 0.5 }),
    ]);
    expect(result.rows[0]?.balance).toMatchObject({
      leavesThisMonth: 0.5,
      leavesThisYear: 2,
      remEl: 4.5,
      remSl: 5,
      remVl: 0,
    });
  });

  it.each([
    ["2026", 365],
    ["2027", 366],
  ])("covers every real day exactly once for June %s", (year, days) => {
    const values = grid();
    values[1]![0] = year;
    values[7]!.fill("S", 1, 373);
    const logs = parseStaffMatrix(values).rows[0]!.logs;
    expect(logs).toHaveLength(days);
    expect(new Set(logs.map((l) => l.incidentDate)).size).toBe(days);
    expect(logs.every((l) => l.creditedDays === 1)).toBe(true);
  });

  it("normalizes late and absence aliases and reads half-day codes", () => {
    const values = grid();
    ["L", "late", "A", "absent", "HS", "HV", "HE", "M", "P", "B", "SP", "SIL", "E"].forEach(
      (code, i) => {
        values[7]![i + 1] = code;
      },
    );
    const logs = parseStaffMatrix(values).rows[0]!.logs;
    expect(logs.slice(0, 7).map((l) => [l.code, l.creditedDays])).toEqual([
      ["LATE", 0],
      ["LATE", 0],
      ["ABSENT", 0],
      ["ABSENT", 0],
      ["HS", 0.5],
      ["HV", 0.5],
      ["HE", 0.5],
    ]);
    expect(logs).toHaveLength(13);
  });

  it("preserves row numbers, empty row gaps, duplicate names and only row-local remarks", () => {
    const values = grid();
    values[0]![390] = "4 BL CARRY OVER";
    values[7]![389] = "1 BL CARRY OVER";
    values[9] = [...values[7]!];
    values[9]![389] = "RETIRED";
    const rows = parseStaffMatrix(values).rows;
    expect(rows.map((r) => r.sheetRowNumber)).toEqual([8, 10]);
    expect(rows[0]!.balance.remBl).toBe(2);
    expect(rows[1]!.balance.employeeStatusNote).toBe("RETIRED");
    expect(rows[1]!.balance.remBl).toBe(1);
  });

  it.each(["", "#REF!", "NaN"])(
    "rejects invalid balances (%s) instead of silently resetting them",
    (value) => {
      const values = grid();
      values[7]![386] = value;
      expect(() => parseStaffMatrix(values)).toThrow("invalid balance");
    },
  );
  it.each(["UNKNOWN", "__proto__", "constructor"])("rejects unsupported code %s", (code) => {
    const values = grid();
    values[7]![1] = code;
    expect(() => parseStaffMatrix(values)).toThrow("Unsupported code");
  });
  it("rejects missing cycle settings and truncated employee rows", () => {
    const values = grid();
    values[0]![0] = "13";
    expect(() => parseStaffMatrix(values)).toThrow("starting month");
    values[0]![0] = "6";
    values[7] = values[7]!.slice(0, 100);
    expect(() => parseStaffMatrix(values)).toThrow("truncated");
  });
});

describe("identity normalization", () => {
  it("keeps all given names and strips only the trailing middle initial", () => {
    expect(sheetNameKey("ADOLFO, STEPHANIE JOY A.")).toBe("ADOLFO,STEPHANIE JOY");
    expect(sheetNameKey("CONCEPCION, CARL CHRISTIAN")).toBe("CONCEPCION,CARL CHRISTIAN");
    expect(sheetNameKey("CONCEPCION, LARIZA G.")).toBe("CONCEPCION,LARIZA");
    expect(sheetNameKey("DE LA CRUZ, MARIA JOY")).toBe("DE LA CRUZ,MARIA JOY");
    expect(normalizeAttendanceName("  Muñoz  ")).toBe("MUNOZ");
  });
  it("accepts the existing institutional domain and the specified institutional domain only", () => {
    expect(attendanceInstitutionalEmail("carl@lyceumalabang.edu.ph")).toBe(true);
    expect(attendanceInstitutionalEmail("carl@lyceumofalabang.edu.ph")).toBe(true);
    expect(attendanceInstitutionalEmail("carl@lyceumofalabang.edu.ph.evil.com")).toBe(false);
    expect(attendanceInstitutionalEmail("carl@gmail.com")).toBe(false);
  });
});
