export const STAFF_GROUPS = ["NON_TEACHING", "COLLEGE", "BASIC_ED"] as const;
export type StaffGroup = (typeof STAFF_GROUPS)[number];

export const BASE_ALLOCATION = 17;

const ANNUAL_LEAVE_CATEGORIES = {
  E: "Emergency",
  S: "Sick",
  V: "Vacation",
  B: "Birthday",
} as const;

export type AnnualLeaveCategory = keyof typeof ANNUAL_LEAVE_CATEGORIES;
export type AnnualLeaveBalances = Record<AnnualLeaveCategory, number>;

export function annualLeaveCreditCategory(code: string): AnnualLeaveCategory | null {
  return code === "E" || code === "S" || code === "V" || code === "B" ? code : null;
}

export function annualLeaveCreditAvailabilityError(
  code: string,
  requestedDays: number,
  balances: AnnualLeaveBalances,
) {
  const category = annualLeaveCreditCategory(code);
  if (!category) return null;
  if (!Number.isFinite(requestedDays) || requestedDays <= 0) {
    throw new Error("Requested leave days must be a finite positive number.");
  }
  const availableByCategory: AnnualLeaveBalances = {
    E: Math.max(0, balances.E),
    S: Math.max(0, balances.S),
    V: Math.max(0, balances.V),
    B: Math.max(0, balances.B),
  };
  const totalAvailable = Math.min(
    BASE_ALLOCATION,
    Object.values(availableByCategory).reduce((total, days) => total + days, 0),
  );
  if (requestedDays > totalAvailable) {
    return `This credited leave needs ${requestedDays} days, but only ${totalAvailable.toFixed(1)} remain in the ${BASE_ALLOCATION}-day tracker balance. Approve as not credited or review the tracker.`;
  }
  if (requestedDays > availableByCategory[category]) {
    return `This credited ${ANNUAL_LEAVE_CATEGORIES[category]} leave needs ${requestedDays} days, but only ${availableByCategory[category].toFixed(1)} remain in that tracker balance. Approve as not credited or review the tracker.`;
  }
  return null;
}

export const ATTENDANCE_CODES = {
  S: { leaveType: "Sick Leave", creditedDays: 1 },
  V: { leaveType: "Vacation", creditedDays: 1 },
  E: { leaveType: "Emergency", creditedDays: 1 },
  B: { leaveType: "Birthday Leave", creditedDays: 1 },
  M: { leaveType: "Maternity Leave", creditedDays: 1 },
  P: { leaveType: "Paternity Leave", creditedDays: 1 },
  SP: { leaveType: "Solo Parent", creditedDays: 1 },
  SIL: { leaveType: "SIL", creditedDays: 1 },
  HS: { leaveType: "Half Day - SL", creditedDays: 0.5 },
  HV: { leaveType: "Half Day - VL", creditedDays: 0.5 },
  HE: { leaveType: "Half Day - EL", creditedDays: 0.5 },
  L: { leaveType: "Late Entry", creditedDays: 0 },
  LATE: { leaveType: "Late Entry", creditedDays: 0 },
  A: { leaveType: "Unexcused Absence", creditedDays: 0 },
  ABSENT: { leaveType: "Unexcused Absence", creditedDays: 0 },
} as const;

export type AttendanceCode = keyof typeof ATTENDANCE_CODES;

/** Uses the current sheet label even for incidents stored with an older label. */
export function attendanceLeaveType(code: string) {
  return Object.hasOwn(ATTENDANCE_CODES, code)
    ? ATTENDANCE_CODES[code as AttendanceCode].leaveType
    : code;
}

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
  workingDates: string[];
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
  const activeMonth = Number(values[0]?.[0]);
  const year = Number(values[1]?.[0]);
  if (
    !Number.isInteger(activeMonth) ||
    activeMonth < 1 ||
    activeMonth > 12 ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100
  ) {
    throw new Error("STAFF!A1 must contain a valid active month and A2 a valid calendar year.");
  }
  const start = dateAtOffset(year, 1, 0).iso;
  const end = dateAtOffset(year, 12, 30).iso;
  const workdayRow = values[2] ?? [];
  const workingDates: string[] = [];
  for (let offset = 0; offset < 372; offset += 1) {
    const monthOffset = Math.floor(offset / 31);
    const day = (offset % 31) + 1;
    const dateObject = new Date(Date.UTC(year, monthOffset, day));
    if (dateObject.getUTCDate() !== day) continue;
    const flag = text(workdayRow[offset + 1]).toLowerCase();
    if (flag !== "true" && flag !== "false") {
      throw new Error(
        `STAFF row 3, column ${offset + 2} must contain a calculated working-day flag.`,
      );
    }
    if (flag === "true") workingDates.push(dateObject.toISOString().slice(0, 10));
  }
  const summaryColumns = {
    month: 373,
    birthday: 379,
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
      const dateObject = new Date(Date.UTC(year, monthOffset, day));
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

    const totalLates = logs.filter((log) => log.code === "L" || log.code === "LATE").length;
    const remEl = balanceNumber(summaryColumns.el);
    const remSl = balanceNumber(summaryColumns.sl);
    const remVl = balanceNumber(summaryColumns.vl);
    const remBl = Math.max(0, 1 - balanceNumber(summaryColumns.birthday));
    const remainingCredits = Math.min(BASE_ALLOCATION, Math.max(0, remEl + remSl + remVl + remBl));
    rows.push({
      sheetRowNumber: rowIndex + 1,
      sheetEmployeeName,
      logs,
      balance: {
        sheetEmployeeName,
        leavesThisMonth: balanceNumber(summaryColumns.month),
        leavesThisYear: BASE_ALLOCATION - remainingCredits,
        remEl,
        remSl,
        remVl,
        remBl,
        totalLates,
        employeeStatusNote: statusNote(values, row),
      },
    });
  }

  return { cycleStart: start, cycleEnd: end, workingDates, rows };
}
