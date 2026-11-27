import { z } from "zod";
import { STAFF_GROUPS } from "./late-absences";
import { institutionalEmailAllowed } from "./validation";

// shortcut: poll every second for the realtime test; increase after HR validates the sheet.
export const ATTENDANCE_REFRESH_MS = 1_000;

export const DEPARTMENT_LABELS = {
  NON_TEACHING: "Non-Teaching",
  COLLEGE: "College",
  BASIC_ED: "Basic Education",
} as const;

export function attendanceInstitutionalEmail(email: string) {
  return (
    institutionalEmailAllowed(email) ||
    email.trim().toLowerCase().endsWith("@lyceumofalabang.edu.ph")
  );
}

export function normalizeAttendanceName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sheetNameKey(name: string) {
  const [last = "", ...rest] = name.split(",");
  // Only a standalone initial (or dotted initials) is a middle initial.
  // JOY and CHRISTIAN remain part of the full given name.
  const given = rest
    .join(",")
    .trim()
    .replace(/\s+(?:[A-Za-z]\.?|(?:[A-Za-z]\.){2,})$/, "");
  return `${normalizeAttendanceName(last)},${normalizeAttendanceName(given)}`;
}

export const claimSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    middleInitial: z
      .string()
      .trim()
      .max(6)
      .regex(/^(?:[a-zA-Z]\.?){0,3}$/),
    lastName: z.string().trim().min(1).max(100),
    departmentGroup: z.enum(STAFF_GROUPS),
  })
  .strict()
  .refine(
    (data) => normalizeAttendanceName(data.firstName) && normalizeAttendanceName(data.lastName),
    "Enter your complete first and last names.",
  );




export const claimApprovalSchema = z
  .object({
    claimId: z.uuid(),
    profileId: z.uuid(),
  })
  .strict();

export const incidentResponseSchema = z
  .object({
    incidentId: z.uuid(),
    revision: z.number().int().positive(),
    explanation: z.string().trim().min(3).max(1000).optional(),
  })
  .strict();

const cell = z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null()]);
export const sheetsSnapshotSchema = z
  .object({
    snapshotId: z.uuid(),
    departmentGroup: z.enum(STAFF_GROUPS),
    spreadsheetId: z.string().regex(/^[a-zA-Z0-9_-]{20,255}$/),
    sheetName: z.literal("STAFF"),
    capturedAt: z.iso.datetime(),
    values: z.array(z.array(cell).max(410)).min(8).max(5000),
  })
  .strict();

export function attendanceMonths(dates: readonly string[]) {
  const months = [...new Set(dates.map((date) => date.slice(0, 7)))]
    .filter((month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    .sort()
    .reverse();
  return months.map((month) => {
    const date = new Date(`${month}-01T00:00:00Z`);
    return {
      value: month,
      label: new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date),
    };
  });
}
