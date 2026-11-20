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

function findColumn(values: string[][], labels: string[]) {
  const wanted = new Set(labels.map((label) => label.toLowerCase()));
  for (let column = 1; column < (values[0]?.length ?? 0); column += 1) {
    for (let row = 0; row < Math.min(values.length, 7); row += 1) {
      if (wanted.has(text(values[row]?.[column]).toLowerCase())) return column;
    }
  }
  return -1;
}

function statusNote(values: string[][], row: string[]) {
  const parts = [...row, ...(values[0] ?? []), ...(values[1] ?? [])]
    .map(text)
    .filter((value) => /(?:CARRY OVER|RESIGNED|RETIRED)/i.test(value));
  return parts.length ? [...new Set(parts)].join(" | ") : null;
}

export function parseStaffMatrix(values: string[][]): ParsedStaffMatrix {
  const startMonth = Math.min(12, Math.max(1, Math.trunc(number(values[0]?.[0], 6))));
  const startYear = Math.max(2000, Math.trunc(number(values[1]?.[0], 2026)));
  const start = dateAtOffset(startYear, startMonth, 0).iso;
  const end = dateAtOffset(startYear, startMonth, 364).iso;
  const summaryColumns = {
    month: findColumn(values, ["Leaves This Month"]),
    year: findColumn(values, ["Leaves This Year"]),
    el: findColumn(values, ["TOTAL EL", "REMAINING EL"]),
    sl: findColumn(values, ["TOTAL SL", "REMAINING SL"]),
    vl: findColumn(values, ["TOTAL VL", "REMAINING VL"]),
    bl: findColumn(values, ["B/L", "REMAINING B/L"]),
    lates: findColumn(values, ["Total Lates Recorded"]),
  };
  const rows: ParsedStaffRow[] = [];

  for (let rowIndex = 7; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] ?? [];
    const sheetEmployeeName = text(row[0]);
    if (!sheetEmployeeName || !sheetEmployeeName.includes(",")) continue;

    const logs: ParsedAttendanceLog[] = [];
    for (let offset = 0; offset < 365; offset += 1) {
      const code = text(row[offset + 1]).toUpperCase() as AttendanceCode;
      const definition = ATTENDANCE_CODES[code];
      if (!definition) continue;
      const date = dateAtOffset(startYear, startMonth, offset);
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
      sheetEmployeeName,
      logs,
      balance: {
        sheetEmployeeName,
        leavesThisMonth: number(row[summaryColumns.month]),
        leavesThisYear: number(row[summaryColumns.year]),
        remEl: number(row[summaryColumns.el], 6),
        remSl: number(row[summaryColumns.sl], 5),
        remVl: number(row[summaryColumns.vl], 5),
        remBl: number(row[summaryColumns.bl], 1 + carryOverBl),
        carryOverBl,
        totalLates:
          summaryColumns.lates >= 0 ? number(row[summaryColumns.lates], totalLates) : totalLates,
        employeeStatusNote: statusNote(values, row),
      },
    });
  }

  return { cycleStart: start, cycleEnd: end, rows };
}
