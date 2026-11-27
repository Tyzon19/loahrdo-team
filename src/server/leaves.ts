import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { all, run, withTransaction, type Db } from "./db";
import { requireAttendanceSession } from "./attendance-auth";
import { authenticateSheetsWebhook } from "./attendance";
import { attendanceAdminAllowed, type AttendanceViewer } from "@/lib/attendance-access";
import { attendanceInstitutionalEmail } from "@/lib/attendance";
import { AppError, isMissingTableError, parseInput } from "@/lib/errors";
import {
  annualLeaveCreditAvailabilityError,
  annualLeaveCreditCategory,
  type AnnualLeaveBalances,
} from "@/lib/late-absences";
import {
  createLeaveSchema,
  decideLeaveSchema,
  leaveRequestDateError,
  leaveRequiresPresident,
  type LeaveRequest,
} from "@/lib/leaves";
import { HRDO_BOOTSTRAP_ADMIN_EMAIL } from "@/lib/hrdo";
import { sendLeaveEmail } from "./gmail";
import { z } from "zod";

type LeaveRow = RowDataPacket &
  Omit<LeaveRequest, "dates" | "balances"> & {
    dates: string | string[];
    balances: string | LeaveRequest["balances"];
    profile_id: string;
  };
const decode = (row: LeaveRow): LeaveRequest => ({
  ...row,
  dates: typeof row.dates === "string" ? JSON.parse(row.dates) : row.dates,
  balances: typeof row.balances === "string" ? JSON.parse(row.balances) : row.balances,
});

function decodeWorkingDates(value: unknown): string[] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new AppError("Tracker working-day settings are invalid. Contact HR.");
    }
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some((date) => typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
  ) {
    throw new AppError("Tracker working-day settings are invalid. Contact HR.");
  }
  return parsed;
}

async function assertLeaveDatesAllowed(
  dates: readonly string[],
  profile: { department_group: string; cycle_start: string; cycle_end: string },
  db: Db,
) {
  const calendars = await all<Array<RowDataPacket & { working_dates: unknown }>>(
    "SELECT working_dates FROM attendance_workday_calendars WHERE department_group=?",
    [profile.department_group],
    db,
  );
  const calendar = calendars[0];
  if (!calendar) {
    throw new AppError(
      "HR must sync tracker working-day settings before leave can be requested or approved.",
    );
  }
  const error = leaveRequestDateError(
    dates,
    String(profile.cycle_start),
    String(profile.cycle_end),
    decodeWorkingDates(calendar.working_dates),
  );
  if (error) throw new AppError(error);
}

async function assertLeaveCreditsAvailable(
  profileId: string,
  cycleStart: string,
  cycleEnd: string,
  code: string,
  dates: readonly string[],
  trackerBalances: AnnualLeaveBalances,
  db: Db,
) {
  if (!annualLeaveCreditCategory(code)) return;
  if (Object.values(trackerBalances).some((balance) => !Number.isFinite(balance))) {
    throw new AppError("Tracker leave balances are invalid. Contact HR.");
  }
  const incidents = await all<Array<RowDataPacket & { incident_date: string }>>(
    "SELECT DATE_FORMAT(incident_date,'%Y-%m-%d') AS incident_date FROM attendance_leave_incidents WHERE profile_id=? AND is_active=1 AND incident_date BETWEEN ? AND ?",
    [profileId, cycleStart, cycleEnd],
    db,
  );
  const countedDates = new Set<string>();
  incidents.forEach((incident) => countedDates.add(incident.incident_date));

  const pendingRequests = await all<
    Array<RowDataPacket & { code: string; dates: string | string[] }>
  >(
    "SELECT code,dates FROM leave_requests WHERE profile_id=? AND status='approved' AND credited=1 AND sync_status IN ('pending','error')",
    [profileId],
    db,
  );
  const availableBalances = { ...trackerBalances };
  for (const request of pendingRequests) {
    const category = annualLeaveCreditCategory(request.code);
    if (!category) continue;
    const requestDates =
      typeof request.dates === "string" ? (JSON.parse(request.dates) as string[]) : request.dates;
    for (const date of requestDates) {
      if (date < cycleStart || date > cycleEnd || countedDates.has(date)) continue;
      countedDates.add(date);
      availableBalances[category] -= 1;
    }
  }

  const error = annualLeaveCreditAvailabilityError(code, dates.length, availableBalances);
  if (error) throw new AppError(error);
}

async function actor() {
  const user = await requireAttendanceSession();
  if (user.mustChangePassword || user.needsProfileCompletion)
    throw new AppError("Complete your account setup first.");
  return user;
}
async function queueEmail(db: Db, id: string, recipient: string, subject: string, message: string) {
  await run(
    "INSERT INTO leave_email_outbox (id,request_id,recipient,subject,message) VALUES (?,?,?,?,?)",
    [randomUUID(), id, recipient, subject, message],
    db,
  );
}
async function notifyHr(db: Db, id: string, employee: string) {
  const recipients = await all<Array<RowDataPacket & { email: string }>>(
    "SELECT DISTINCT u.email FROM users u LEFT JOIN hrdo_users h ON h.email=u.email WHERE u.is_super_admin=1 OR (h.is_external=0 AND h.role='hrdo_admin') OR u.email=?",
    [HRDO_BOOTSTRAP_ADMIN_EMAIL],
    db,
  );
  if (!recipients.length)
    throw new AppError("No HR reviewer is configured. Contact the administrator.");
  for (const recipient of recipients)
    await queueEmail(
      db,
      id,
      recipient.email,
      "Leave application: HR review required",
      `${employee}'s leave has recommending approval and is ready for HR review.`,
    );
}
export async function deliverLeaveEmails() {
  // Lock each outbox row through delivery so concurrent requests cannot send it twice.
  for (let count = 0; count < 10; count++) {
    const processed = await withTransaction(async (db) => {
      const rows = await all<
        Array<RowDataPacket & { id: string; recipient: string; subject: string; message: string }>
      >(
        "SELECT * FROM leave_email_outbox WHERE sent_at IS NULL ORDER BY attempts, id LIMIT 1 FOR UPDATE",
        [],
        db,
      );
      const row = rows[0];
      if (!row) return false;
      try {
        await sendLeaveEmail(row.recipient, row.subject, row.message);
        await run(
          "UPDATE leave_email_outbox SET sent_at=NOW(), attempts=attempts+1,last_error=NULL WHERE id=?",
          [row.id],
          db,
        );
      } catch (error) {
        await run(
          "UPDATE leave_email_outbox SET attempts=attempts+1,last_error=? WHERE id=?",
          [(error instanceof Error ? error.message : "Delivery failed").slice(0, 500), row.id],
          db,
        );
        return false;
      }
      return true;
    });
    if (!processed) break;
  }
}
async function leaveReviewer(user: AttendanceViewer, db?: Db) {
  const reporting = await all<
    Array<RowDataPacket & { supervisor_id: string; is_department_head: number }>
  >(
    "SELECT supervisor_id,is_department_head FROM leave_reporting_lines WHERE employee_id=?",
    [user.id],
    db,
  );
  const president =
    leaveRequiresPresident(user.accountRole) || Boolean(reporting[0]?.is_department_head);
  const department =
    user.department.trim().toUpperCase() === "HRDO"
      ? "Human Resources Development Office"
      : user.department;
  const heads = await all<Array<RowDataPacket & { id: string; name: string; email: string }>>(
    reporting[0] && !president
      ? "SELECT id,name,email FROM users WHERE id=? AND id<>?"
      : `SELECT id,name,email FROM users WHERE role=? AND id<>? ${president ? "" : "AND department=?"}`,
    reporting[0] && !president
      ? [reporting[0].supervisor_id, user.id]
      : president
        ? ["president", user.id]
        : ["department_head", user.id, department],
    db,
  );
  return { president, head: heads.length === 1 ? heads[0] : undefined };
}
export async function listLeaves() {
  const user = await actor();
  const admin = attendanceAdminAllowed(user);
  const reviewer = await leaveReviewer(user);
  const rows = await all<LeaveRow[]>(
    `SELECT id,employee_id,employee_name,department,code,dates,status,president_required,recommender_id,recommender_name,credited,created_at,sync_status,sync_error FROM leave_requests WHERE employee_id=? OR recommender_id=? ${admin ? "OR 1=1" : ""} ORDER BY created_at DESC LIMIT 200`,
    [user.id, user.id],
  );
  let linkedProfiles: Array<
    RowDataPacket & {
      full_name: string;
      department_group: string;
      cycle_start: string;
      cycle_end: string;
      working_dates: unknown;
    }
  >;
  let workdayCalendarAvailable = true;
  try {
    linkedProfiles = await all(
      `SELECT p.full_name,p.department_group,p.cycle_start,p.cycle_end,c.working_dates
       FROM hr_sheet_profiles p
       LEFT JOIN attendance_workday_calendars c ON c.department_group=p.department_group
       WHERE p.claimed_by_user_id=? AND p.is_active=1`,
      [user.id],
    );
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
    workdayCalendarAvailable = false;
    linkedProfiles = await all(
      `SELECT full_name,department_group,cycle_start,cycle_end,NULL AS working_dates
       FROM hr_sheet_profiles WHERE claimed_by_user_id=? AND is_active=1`,
      [user.id],
    );
  }
  const pending = await all<Array<RowDataPacket & { total: number }>>(
    `SELECT COUNT(*) AS total FROM leave_email_outbox e JOIN leave_requests r ON r.id=e.request_id WHERE e.sent_at IS NULL AND (r.employee_id=? OR r.recommender_id=? ${admin ? "OR 1=1" : ""})`,
    [user.id, user.id],
  );
  return {
    requests: rows.map(decode),
    user,
    profile: linkedProfiles[0]
      ? {
          name: String(linkedProfiles[0].full_name),
          cycleStart: String(linkedProfiles[0].cycle_start),
          cycleEnd: String(linkedProfiles[0].cycle_end),
          workingDates:
            linkedProfiles[0].working_dates === null
              ? null
              : decodeWorkingDates(linkedProfiles[0].working_dates),
        }
      : null,
    pendingEmails: Number(pending[0]?.total ?? 0),
    workdayCalendarAvailable,
    requiresPresident: reviewer.president,
    reviewerName: reviewer.head?.name ?? null,
  };
}
export async function getLeave(input: unknown) {
  const user = await actor();
  const id = parseInput(z.string().uuid(), input);
  const rows = await all<LeaveRow[]>(
    `SELECT * FROM leave_requests WHERE id=? AND (employee_id=? OR recommender_id=? ${attendanceAdminAllowed(user) ? "OR 1=1" : ""})`,
    [id, user.id, user.id],
  );
  if (!rows[0]) throw new AppError("Application not found or access denied.");
  return decode(rows[0]);
}
export async function createLeave(input: unknown) {
  const user = await actor();
  const data = parseInput(createLeaveSchema, input);
  const dates = [...data.dates].sort();
  await withTransaction(async (db) => {
    const profiles = await all<RowDataPacket[]>(
      "SELECT * FROM hr_sheet_profiles WHERE claimed_by_user_id=? AND is_active=1 FOR UPDATE",
      [user.id],
      db,
    );
    const profile = profiles[0];
    if (!profile)
      throw new AppError("HR must link your active tracker record before you can request leave.");
    const previous = await all<LeaveRow[]>(
      "SELECT * FROM leave_requests WHERE id=?",
      [data.id],
      db,
    );
    if (previous[0]) {
      if (previous[0].employee_id !== user.id) throw new AppError("Invalid request reference.");
      return;
    }
    await assertLeaveDatesAllowed(
      dates,
      {
        department_group: String(profile["department_group"]),
        cycle_start: String(profile["cycle_start"]),
        cycle_end: String(profile["cycle_end"]),
      },
      db,
    );
    const { president, head } = await leaveReviewer(user, db);
    if (!head)
      throw new AppError(
        president
          ? "HR must configure exactly one President/CEO account before submission."
          : "HR must assign your immediate supervisor before submission.",
      );
    const conflicts = await all<RowDataPacket[]>(
      "SELECT leave_date FROM leave_request_days WHERE profile_id=? AND leave_date IN (?)",
      [profile["id"], dates],
      db,
    );
    const recorded = await all<RowDataPacket[]>(
      "SELECT incident_date FROM attendance_leave_incidents WHERE profile_id=? AND is_active=1 AND incident_date IN (?)",
      [profile["id"], dates],
      db,
    );
    if (conflicts.length || recorded.length)
      throw new AppError(
        "A selected date already has a leave request or attendance entry. Contact HR to resolve it.",
      );
    await run(
      `INSERT INTO leave_requests (id,employee_id,profile_id,employee_name,department,code,reason,dates,employee_signature,medical_certificate,recommender_id,recommender_name,president_required,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'')`,
      [
        data.id,
        user.id,
        profile["id"],
        profile["full_name"],
        user.department,
        data.code,
        data.reason,
        JSON.stringify(dates),
        data.signature.image,
        data.medicalCertificate ?? null,
        head.id,
        head.name,
        Number(president),
      ],
      db,
    );
    for (const date of dates)
      await run(
        "INSERT INTO leave_request_days (profile_id,leave_date,request_id) VALUES (?,?,?)",
        [profile["id"], date, data.id],
        db,
      );
    await queueEmail(
      db,
      data.id,
      head.email,
      "Leave application: recommending approval required",
      `${profile["full_name"]} submitted ${dates.length} day(s) of leave, ${dates[0]} to ${dates.at(-1)}. Review and sign in Leave & Attendance.`,
    );
    await queueEmail(
      db,
      data.id,
      user.email,
      "Your leave application was submitted",
      `Your application is awaiting ${head.name}'s recommending approval, then HR review.`,
    );
  });
  await deliverLeaveEmails();
  return { id: data.id };
}
export async function decideLeave(input: unknown) {
  const user = await actor();
  const data = parseInput(decideLeaveSchema, input);
  await withTransaction(async (db) => {
    const rows = await all<LeaveRow[]>(
      "SELECT * FROM leave_requests WHERE id=? FOR UPDATE",
      [data.id],
      db,
    );
    const row = rows[0];
    if (!row || row.employee_id === user.id)
      throw new AppError("You cannot decide this application.");
    const recommending = row.status === "pending_recommendation" && row.recommender_id === user.id;
    const hr = row.status === "pending_hr" && attendanceAdminAllowed(user);
    if (!recommending && !hr)
      throw new AppError("This application is not awaiting your approval. Refresh the list.");
    const rejected = data.decision === "reject";
    if (hr && !rejected) {
      const linkedProfiles = await all<
        Array<
          RowDataPacket & {
            department_group: string;
            cycle_start: string;
            cycle_end: string;
            remaining_el: number | string;
            remaining_sl: number | string;
            remaining_vl: number | string;
            remaining_bl: number | string;
          }
        >
      >(
        "SELECT department_group,cycle_start,cycle_end,remaining_el,remaining_sl,remaining_vl,remaining_bl FROM hr_sheet_profiles WHERE id=? FOR UPDATE",
        [row.profile_id],
        db,
      );
      const profile = linkedProfiles[0];
      if (!profile) throw new AppError("The linked tracker profile is unavailable.");
      const dates = decode(row).dates;
      await assertLeaveDatesAllowed(dates, profile, db);
      if (data.credited) {
        await assertLeaveCreditsAvailable(
          row.profile_id,
          String(profile.cycle_start),
          String(profile.cycle_end),
          row.code,
          dates,
          {
            E: Number(profile.remaining_el),
            S: Number(profile.remaining_sl),
            V: Number(profile.remaining_vl),
            B: Number(profile.remaining_bl),
          },
          db,
        );
      }
    }
    if (hr && !rejected && data.credited === undefined)
      throw new AppError("Select credited or not credited.");
    if (recommending) {
      await run(
        "UPDATE leave_requests SET recommender_signature=?,recommended_at=NOW(),status=?,note=? WHERE id=?",
        [data.signature.image, rejected ? "rejected" : "pending_hr", data.note, data.id],
        db,
      );
      if (!rejected) await notifyHr(db, data.id, row.employee_name);
    } else {
      const credited = rejected ? null : Boolean(data.credited);
      await run(
        "UPDATE leave_requests SET hr_id=?,hr_name=?,hr_signature=?,decided_at=NOW(),status=?,note=?,credited=?,sync_status=? WHERE id=?",
        [
          user.id,
          user.name,
          data.signature.image,
          rejected ? "rejected" : "approved",
          data.note,
          credited === null ? null : Number(credited),
          rejected || credited === false ? "not_required" : "pending",
          data.id,
        ],
        db,
      );
    }
    if (rejected) await run("DELETE FROM leave_request_days WHERE request_id=?", [data.id], db);
    const employees = await all<Array<RowDataPacket & { email: string }>>(
      "SELECT email FROM users WHERE id=?",
      [row.employee_id],
      db,
    );
    const employeeMessage = rejected
      ? `Rejected. ${data.note}`
      : !hr
        ? "Your application is now awaiting HR review."
        : data.credited
          ? "HR has approved your leave. The tracker update is queued; view its status and signed form online."
          : "HR has approved your leave as not credited. No SL/VL credits were deducted; HR will record it in the tracker using the institution's non-crediting process.";
    await queueEmail(
      db,
      data.id,
      employees[0]!.email,
      `Leave application ${
        rejected
          ? "rejected"
          : hr
            ? data.credited
              ? "approved by HR"
              : "approved by HR (not credited)"
            : "recommended for approval"
      }`,
      `${row.employee_name}: ${employeeMessage}`,
    );
  });
  await deliverLeaveEmails();
  return { ok: true };
}
export async function retryLeaveDelivery() {
  const user = await actor();
  if (!attendanceAdminAllowed(user)) throw new AppError("Only HR may retry delivery.");
  await deliverLeaveEmails();
  return { ok: true };
}
export async function leaveReportingLines() {
  const user = await actor();
  if (!attendanceAdminAllowed(user)) throw new AppError("Only HR may manage reporting lines.");
  const users = await all<
    Array<
      RowDataPacket & {
        id: string;
        name: string;
        email: string;
        department: string;
        role: string;
      }
    >
  >(
    "SELECT id,name,email,department,role FROM users WHERE profile_complete=1 AND role<>'admin' ORDER BY name",
  );
  const lines = await all<
    Array<
      RowDataPacket & { employee_id: string; supervisor_id: string; is_department_head: number }
    >
  >("SELECT employee_id,supervisor_id,is_department_head FROM leave_reporting_lines");
  return {
    users: users
      .filter((u) => attendanceInstitutionalEmail(u.email))
      .map((u) => ({
        id: u.id,
        name: u.name,
        department: u.department,
        routesToPresident: ["department_head", "transport_head", "director"].includes(u.role),
      })),
    lines: lines.map((r) => ({
      employeeId: r.employee_id,
      supervisorId: r.supervisor_id,
      isHead: Boolean(r.is_department_head),
    })),
  };
}
export async function saveLeaveReportingLine(input: unknown) {
  const user = await actor();
  if (!attendanceAdminAllowed(user)) throw new AppError("Only HR may manage reporting lines.");
  const data = parseInput(
    z
      .object({
        employeeId: z.string().uuid(),
        supervisorId: z.string().uuid(),
        isHead: z.boolean(),
      })
      .strict()
      .refine(
        (d) => d.employeeId !== d.supervisorId,
        "An employee cannot supervise their own leave.",
      ),
    input,
  );
  const users = await all<Array<RowDataPacket & { id: string; email: string }>>(
    "SELECT id,email FROM users WHERE id IN (?,?) AND profile_complete=1 AND role<>'admin'",
    [data.employeeId, data.supervisorId],
  );
  if (users.length !== 2 || users.some((u) => !attendanceInstitutionalEmail(u.email)))
    throw new AppError("Select two active institutional accounts.");
  await run(
    "INSERT INTO leave_reporting_lines(employee_id,supervisor_id,is_department_head,updated_by) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE supervisor_id=VALUES(supervisor_id),is_department_head=VALUES(is_department_head),updated_by=VALUES(updated_by),updated_at=NOW()",
    [data.employeeId, data.supervisorId, Number(data.isHead), user.id],
  );
  return { ok: true };
}
export async function leaveTrackerJobs(request: Request) {
  try {
    authenticateSheetsWebhook(request.headers.get("x-hrdo-webhook-secret"));
    if (request.method === "POST") {
      if (Number(request.headers.get("content-length") ?? 0) > 5000)
        return Response.json({ ok: false }, { status: 413 });
      const body = await request.text();
      if (body.length > 5000) return Response.json({ ok: false }, { status: 413 });
      const data = parseInput(
        z
          .object({
            id: z.string().uuid(),
            error: z.string().max(500).optional(),
            utilized: z
              .object({
                sl: z.number().finite().min(0).max(10000),
                vl: z.number().finite().min(0).max(10000),
              })
              .strict()
              .optional(),
          })
          .strict(),
        JSON.parse(body),
      );
      await withTransaction(async (db) => {
        const rows = await all<LeaveRow[]>(
          "SELECT * FROM leave_requests WHERE id=? AND status='approved' FOR UPDATE",
          [data.id],
          db,
        );
        const row = rows[0];
        if (!row) throw new AppError("Approved application not found.");
        if (!row.credited)
          throw new AppError(
            "Not-credited leave is final in the application and does not use a tracker write.",
          );
        if (row.sync_status === "synced") return;
        if (data.error) {
          await run(
            "UPDATE leave_requests SET sync_status='error',sync_error=? WHERE id=?",
            [data.error, data.id],
            db,
          );
          return;
        }
        const dates = decode(row).dates;
        const linkedProfiles = await all<
          Array<
            RowDataPacket & {
              department_group: string;
              cycle_start: string;
              cycle_end: string;
            }
          >
        >(
          "SELECT department_group,cycle_start,cycle_end FROM hr_sheet_profiles WHERE id=?",
          [row.profile_id],
          db,
        );
        const profile = linkedProfiles[0];
        if (!profile) throw new AppError("The linked tracker profile is unavailable.");
        await assertLeaveDatesAllowed(dates, profile, db);
        const incidents = await all<RowDataPacket[]>(
          "SELECT incident_date,code FROM attendance_leave_incidents WHERE profile_id=? AND is_active=1 AND incident_date IN (?)",
          [row.profile_id, dates],
          db,
        );
        if (incidents.length !== dates.length || incidents.some((i) => i["code"] !== row.code))
          throw new AppError(
            "Push the updated tracker snapshot before acknowledging this application.",
          );
        const profiles = await all<RowDataPacket[]>(
          "SELECT remaining_sl,remaining_vl FROM hr_sheet_profiles WHERE id=?",
          [row.profile_id],
          db,
        );
        if (!data.utilized) throw new AppError("Include the tracker utilized leave totals.");
        const balances = {
          usedSl: data.utilized.sl,
          usedVl: data.utilized.vl,
          remainingSl: Number(profiles[0]!["remaining_sl"]),
          remainingVl: Number(profiles[0]!["remaining_vl"]),
        };
        await run(
          "UPDATE leave_requests SET sync_status='synced',sync_error=NULL,balances=? WHERE id=?",
          [JSON.stringify(balances), data.id],
          db,
        );
      });
      return Response.json({ ok: true });
    }
    await deliverLeaveEmails();
    const rows = await all<RowDataPacket[]>(
      `SELECT r.id,r.code,r.dates,r.credited,p.department_group,p.sheet_row_number,p.full_name,p.cycle_start,p.cycle_end,s.spreadsheet_id FROM leave_requests r JOIN hr_sheet_profiles p ON p.id=r.profile_id JOIN sheet_sources s ON s.staff_group=p.department_group WHERE r.status='approved' AND r.credited=1 AND r.sync_status IN ('pending','error') AND p.is_active=1 ORDER BY r.created_at LIMIT 20`,
    );
    return Response.json(
      {
        ok: true,
        jobs: rows.map((r) => ({
          ...r,
          dates: typeof r["dates"] === "string" ? JSON.parse(r["dates"]) : r["dates"],
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof AppError ? error.message : "Unable to process tracker update.",
      },
      { status: 400 },
    );
  }
}
