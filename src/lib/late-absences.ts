export const STAFF_GROUPS = ["NON_TEACHING", "COLLEGE", "BASIC_ED"] as const;
export type StaffGroup = (typeof STAFF_GROUPS)[number];

export const CYCLE_LABEL = "June 2026 - May 2027";
export const CYCLE_EXPIRY_DATE = "2027-05-31";
export const BASE_ALLOCATION = 17;

export const ATTENDANCE_CODES = {
  S: { leaveType: "Sick Leave", creditedDays: 1 },
  V: { leaveType: "Vacation Leave", creditedDays: 1 },
  E: { leaveType: "Emergency Leave", creditedDays: 1 },
  B: { leaveType: "Birthday Leave", creditedDays: 1 },
  M: { leaveType: "Maternity Leave", creditedDays: 1 },
  P: { leaveType: "Paternity Leave", creditedDays: 1 },
  SP: { leaveType: "Solo Parent Leave", creditedDays: 1 },
  SIL: { leaveType: "Service Incentive Leave", creditedDays: 1 },
  HS: { leaveType: "Half-Day Sick Leave", creditedDays: 0.5 },
  HV: { leaveType: "Half-Day Vacation Leave", creditedDays: 0.5 },
  HE: { leaveType: "Half-Day Emergency Leave", creditedDays: 0.5 },
  L: { leaveType: "Late Entry", creditedDays: 0 },
  LATE: { leaveType: "Late Entry", creditedDays: 0 },
  A: { leaveType: "Unexcused Absence", creditedDays: 0 },
  ABSENT: { leaveType: "Unexcused Absence", creditedDays: 0 },
} as const;

export type AttendanceCode = keyof typeof ATTENDANCE_CODES;

export interface ParsedAttendanceLog {
  sheetEmployeeName: string;
  incidentDate: string;
  dayOfWeek: string;
  code: AttendanceCode;
  leaveType: string;
  creditedDays: number;
}

export interface ParsedBalance {
  sheetEmployeeName: string;
  leavesThisMonth: number;
  leavesThisYear: number;
  remEl: number;
  remSl: number;
  remVl: number;
  remBl: number;
  carryOverBl: number;
  totalLates: number;
  employeeStatusNote: string | null;
}

export interface ParsedStaffRow {
  sheetRowNumber: number;
  sheetEmployeeName: string;
  logs: ParsedAttendanceLog[];
  balance: ParsedBalance;
}

export interface ParsedStaffMatrix {
  cycleStart: string;
  cycleEnd: string;
  rows: ParsedStaffRow[];
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedNameToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/gi, "")
    .toUpperCase();
}

export function attendanceSheetNameMatchesUserName(sheetEmployeeName: string, userName: string) {
  const commaIndex = sheetEmployeeName.indexOf(",");
  if (commaIndex < 0) return false;

  const sheetSurname = normalizedNameToken(sheetEmployeeName.slice(0, commaIndex));
  const givenNames = sheetEmployeeName
    .slice(commaIndex + 1)
    .split(/\s+/)
    .map(normalizedNameToken)
    .filter(Boolean);
  if (!sheetSurname || !givenNames.length) return false;

  const sheetFirstName = givenNames[0] ?? "";
  const sheetMiddleNames = givenNames.length > 2 ? givenNames.slice(1, -1) : [];

  const userParts = userName.trim().split(/\s+/).map(normalizedNameToken).filter(Boolean);
  if (userParts.length < 2) return false;

  const userFirstName = userParts[0] ?? "";
  const userSurname = userParts.at(-1) ?? "";
  const userMiddleNames = userParts.slice(1, -1);

  if (sheetSurname !== userSurname || sheetFirstName !== userFirstName) return false;
  if (sheetMiddleNames.length) {
    return sheetMiddleNames.every((middleName) =>
      userMiddleNames.some((userMiddleName) => userMiddleName === middleName),
    );
  }
  return true;
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateAtOffset(year: number, month: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1, 1 + offset));
  return {
    iso: date.toISOString().slice(0, 10),
    dayOfWeek: new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: "UTC",
    }).format(date),
  };
}

function statusNote(_values: string[][], row: string[]) {
  const parts = row
    .slice(389)
    .map(text)
    .filter((value) => /(?:CARRY OVER|RESIGNED|RETIRED)/i.test(value));
  return parts.length ? [...new Set(parts)].join(" | ") : null;
}

export function parseStaffMatrix(values: string[][]): ParsedStaffMatrix {
  const startMonth = Number(values[0]?.[0]);
  const startYear = Number(values[1]?.[0]);
  if (
    !Number.isInteger(startMonth) ||
    startMonth < 1 ||
    startMonth > 12 ||
    !Number.isInteger(startYear) ||
    startYear < 2000 ||
    startYear > 2100
  ) {
    throw new Error("STAFF!A1 and A2 must contain a valid starting month and year.");
  }
  const start = dateAtOffset(startYear, startMonth, 0).iso;
  const end = new Date(Date.UTC(startYear, startMonth - 1 + 12, 0)).toISOString().slice(0, 10);
  const summaryColumns = {
    month: 373,
    year: 374,
    el: 386,
    sl: 387,
    vl: 388,
  };
  const rows: ParsedStaffRow[] = [];

  for (let rowIndex = 7; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] ?? [];
    const sheetEmployeeName = text(row[0]);
    if (!sheetEmployeeName || !sheetEmployeeName.includes(",")) continue;
    if (sheetEmployeeName.length > 190)
      throw new Error(`STAFF row ${rowIndex + 1} has a name longer than 190 characters.`);
    if (row.length < 389) throw new Error(`STAFF row ${rowIndex + 1} is truncated before NY.`);
    const balanceNumber = (column: number) => {
      const raw = text(row[column]);
      const parsed = Number(raw.replace(/,/g, ""));
      if (!raw || !Number.isFinite(parsed) || Math.abs(parsed) > 9999) {
        throw new Error(`STAFF row ${rowIndex + 1}, column ${column + 1} has an invalid balance.`);
      }
      return parsed;
    };

    const logs: ParsedAttendanceLog[] = [];
    for (let offset = 0; offset < 372; offset += 1) {
      const monthOffset = Math.floor(offset / 31);
      const day = (offset % 31) + 1;
      const dateObject = new Date(Date.UTC(startYear, startMonth - 1 + monthOffset, day));
      if (dateObject.getUTCDate() !== day) continue;
      const rawCode = text(row[offset + 1]).toUpperCase();
      if (!rawCode) continue;
      const code = (
        rawCode === "L" ? "LATE" : rawCode === "A" ? "ABSENT" : rawCode
      ) as AttendanceCode;
      const definition = ATTENDANCE_CODES[code];
      if (!Object.hasOwn(ATTENDANCE_CODES, code) || !definition) {
        throw new Error(`Unsupported code in STAFF row ${rowIndex + 1}, column ${offset + 2}.`);
      }
      const date = {
        iso: dateObject.toISOString().slice(0, 10),
        dayOfWeek: new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(
          dateObject,
        ),
      };
      logs.push({
        sheetEmployeeName,
        incidentDate: date.iso,
        dayOfWeek: date.dayOfWeek,
        code,
        leaveType: definition.leaveType,
        creditedDays: definition.creditedDays,
      });
    }

    const carryOverMatch = statusNote(values, row)?.match(/(\d+(?:\.\d+)?)\s+BL\s+CARRY OVER/i);
    const carryOverBl = carryOverMatch ? number(carryOverMatch[1]) : 0;
    const totalLates = logs.filter((log) => log.code === "L" || log.code === "LATE").length;
    rows.push({
      sheetRowNumber: rowIndex + 1,
      sheetEmployeeName,
      logs,
      balance: {
        sheetEmployeeName,
        leavesThisMonth: balanceNumber(summaryColumns.month),
        leavesThisYear: balanceNumber(summaryColumns.year),
        remEl: balanceNumber(summaryColumns.el),
        remSl: balanceNumber(summaryColumns.sl),
        remVl: balanceNumber(summaryColumns.vl),
        remBl: 1 + carryOverBl - logs.filter((log) => log.code === "B").length,
        carryOverBl,
        totalLates,
        employeeStatusNote: statusNote(values, row),
      },
    });
  }

  return { cycleStart: start, cycleEnd: end, rows };
}
