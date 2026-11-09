import type { RowDataPacket } from "mysql2/promise";
import type {
  DocConfig,
  EmailKind,
  EmailMessage,
  HistoryEvent,
  Role,
  SignatureRecord,
  StageKey,
  Status,
  User,
  Vehicle,
  VehicleRequest,
} from "@/lib/types";
import { all, type Db } from "./db";

export interface RequestDbRow extends RowDataPacket {
  id: string;
  number: string;
  requisitioner_id: string;
  requisitioner_name: string;
  department: string;
  passengers: number;
  date_start: string;
  date_end: string;
  time_needed: string;
  purpose: string;
  status: Status;
  attempt: number;
  vehicle_id: string | null;
  vehicle_type: string | null;
  plate_no: string | null;
  review_remarks: string | null;
  approved_at: string | null;
  created_at: string;
  submitted_at: string;
}

export interface DestinationDbRow extends RowDataPacket {}
export interface UserDbRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
}

export interface SignatureDbRow extends RowDataPacket {
  id: string;
  stage: StageKey;
  attempt: number;
  signer_id: string | null;
  signer_name: string;
  proxy_signer_name: string | null;
  signer_role: Role;
  image: string | null;
  method: "drawn" | "uploaded";
  remarks: string | null;
  signed_at: string;
}

export interface HistoryDbRow extends RowDataPacket {
  id: string;
  attempt: number;
  actor_id: string | null;
  actor_name: string;
  actor_role: Role;
  type: HistoryEvent["type"];
  message: string;
  reason: string | null;
  happened_at: string;
}

export interface ReturnDbRow extends RowDataPacket {
  stage: StageKey;
  by_id: string | null;
  by_name: string;
  by_role: Role;
  reason: string;
  attempt: number;
  returned_at: string;
}

export interface DispatchDbRow extends RowDataPacket {
  dispatched_by: string | null;
  time_out: string | null;
  time_in: string | null;
  user_signature_name: string | null;
  odometer_start: number | null;
  odometer_end: number | null;
  driver_report: string | null;
  driver_name: string | null;
  completed_at: string | null;
}

export interface NotificationDbRow extends RowDataPacket {
  id: string;
  request_id: string;
  request_number: string;
  to_user_id: string;
  to_name: string;
  to_email: string;
  subject: string;
  kind: EmailKind;
  stage: StageKey | null;
  heading: string;
  body: string;
  cta_label: string;
  read_at: string | null;
  email_status: "pending" | "sent" | "failed" | null;
  email_error: string | null;
  created_at: string;
}

export interface VehicleDbRow extends RowDataPacket {
  id: string;
  type: string;
  plate_no: string;
  capacity: number;
  status: "in_service" | "maintenance";
}

export interface DocDbRow extends RowDataPacket {
  institution: string;
  certification: string;
  office: string;
  title: string;
  doc_no: string;
  revision_no: string;
  effective_date: string;
}

export function isoTimestamp(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value.includes("T")) return value.endsWith("Z") ? value : `${value}Z`;
  return `${value.replace(" ", "T")}Z`;
}

export function toDbTimestamp(iso: string | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toISOString().slice(0, 19).replace("T", " ");
}

export function mappedUser(row: UserDbRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department,
  };
}

export async function loadUsers(db: Db): Promise<User[]> {
  return (
    await all<UserDbRow[]>("SELECT id, name, email, role, department FROM users", [], db)
  ).map(mappedUser);
}

export async function loadApproverNames(db: Db): Promise<Partial<Record<StageKey, string>>> {
  return (await loadMainSignatories(db)).names;
}

export async function loadApproverUserIds(db: Db): Promise<Partial<Record<StageKey, string>>> {
  return (await loadMainSignatories(db)).configuredUserIds;
}

export async function loadEffectiveApproverUserIds(
  db: Db,
): Promise<Partial<Record<StageKey, string>>> {
  return (await loadMainSignatories(db)).userIds;
}

async function loadMainSignatories(db: Db) {
  const assignments = await all<RowDataPacket[]>(
    `SELECT a.stage_key, a.user_id, u.name
     FROM main_signatory_assignments a
     JOIN users u ON u.id = a.user_id`,
    [],
    db,
  );
  const configuredUserIds: Partial<Record<StageKey, string>> = {};
  const configuredNames: Partial<Record<StageKey, string>> = {};
  for (const row of assignments) {
    const stageKey = String(row["stage_key"]);
    if (stageKey !== "review" && stageKey !== "recommend" && stageKey !== "approve") continue;
    configuredUserIds[stageKey] = String(row["user_id"]);
    configuredNames[stageKey] = String(row["name"]);
  }

  return {
    names: configuredNames,
    userIds: configuredUserIds,
    configuredUserIds,
  };
}

export interface AssistantDbRow extends RowDataPacket {
  stage_key: string;
  assistant_name: string;
  assistant_user_id: string | null;
}

export async function loadAssistantNames(db: Db): Promise<Partial<Record<StageKey, string>>> {
  const rows = await all<AssistantDbRow[]>(
    "SELECT stage_key, assistant_name, assistant_user_id FROM signatory_assistants WHERE assistant_user_id IS NOT NULL",
    [],
    db,
  );
  const out: Partial<Record<StageKey, string>> = {};
  for (const row of rows) {
    if (row.stage_key === "review" || row.stage_key === "recommend" || row.stage_key === "approve")
      out[row.stage_key] = row.assistant_name;
  }
  return out;
}

export async function loadAssistantUserIds(db: Db): Promise<Partial<Record<StageKey, string>>> {
  const rows = await all<AssistantDbRow[]>(
    "SELECT stage_key, assistant_name, assistant_user_id FROM signatory_assistants",
    [],
    db,
  );
  const out: Partial<Record<StageKey, string>> = {};
  for (const row of rows) {
    if (
      (row.stage_key === "review" ||
        row.stage_key === "recommend" ||
        row.stage_key === "approve") &&
      row.assistant_user_id
    ) {
      out[row.stage_key] = row.assistant_user_id;
    }
  }
  return out;
}

export async function loadDoc(db: Db): Promise<DocConfig> {
  const rows = await all<DocDbRow[]>(
    "SELECT institution, certification, office, title, doc_no, revision_no, effective_date FROM doc_config WHERE id = 1",
    [],
    db,
  );
  const row = rows[0];
  return {
    institution: row?.institution ?? "LYCEUM OF ALABANG INC.",
    certification: row?.certification ?? "ISO 9001:2015 Certified",
    office: row?.office ?? "PHYSICAL FACILITIES MANAGEMENT OFFICE",
    title: row?.title ?? "VEHICLE RESERVATION AND TRIP TICKET",
    docNo: row?.doc_no ?? "LOA-PFMO-VRTT-001",
    revisionNo: row?.revision_no ?? "02",
    effectiveDate: row?.effective_date ?? "2026-05-11",
  };
}

export async function loadVehicles(db: Db): Promise<Vehicle[]> {
  return (
    await all<VehicleDbRow[]>(
      "SELECT id, type, plate_no, capacity, status FROM vehicles ORDER BY type, plate_no",
      [],
      db,
    )
  ).map((row) => ({
    id: row.id,
    type: row.type,
    plateNo: row.plate_no,
    capacity: row.capacity,
    status: row.status,
  }));
}

export async function loadRequest(
  db: Db,
  id: string,
  includeSignatureImages = true,
): Promise<VehicleRequest | null> {
  const rows = await all<RequestDbRow[]>(
    `SELECT id, number, requisitioner_id, requisitioner_name, department, passengers,
            date_start, date_end, time_needed, purpose, status, attempt, vehicle_id,
            vehicle_type, plate_no, review_remarks, approved_at, created_at, submitted_at
     FROM requests WHERE id = ? LIMIT 1`,
    [id],
    db,
  );
  const row = rows[0];
  if (!row) return null;

  const destinations = await all<RowDataPacket[]>(
    "SELECT destination FROM request_destinations WHERE request_id = ? ORDER BY sort_order",
    [id],
    db,
  );
  const signatures = await all<SignatureDbRow[]>(
    `SELECT id, stage, attempt, signer_id, signer_name, signer_role, proxy_signer_name,
            ${includeSignatureImages ? "image" : "NULL AS image"}, method, remarks, signed_at
     FROM request_signatures WHERE request_id = ? ORDER BY signed_at, id`,
    [id],
    db,
  );
  const history = await all<HistoryDbRow[]>(
    `SELECT id, attempt, actor_id, actor_name, actor_role, type, message, reason, happened_at
     FROM request_history WHERE request_id = ? ORDER BY happened_at, id`,
    [id],
    db,
  );
  const returns = await all<ReturnDbRow[]>(
    `SELECT stage, by_id, by_name, by_role, reason, attempt, returned_at
     FROM request_returns WHERE request_id = ? ORDER BY returned_at DESC LIMIT 1`,
    [id],
    db,
  );
  const dispatchRows = await all<DispatchDbRow[]>(
    `SELECT dispatched_by, time_out, time_in, user_signature_name, odometer_start,
            odometer_end, driver_report, driver_name, completed_at
     FROM dispatch_records WHERE request_id = ? LIMIT 1`,
    [id],
    db,
  );

  const lastReturn = returns[0];
  const dispatch = dispatchRows[0];

  return {
    id: row.id,
    number: row.number,
    requisitionerId: row.requisitioner_id,
    requisitionerName: row.requisitioner_name,
    department: row.department,
    passengers: row.passengers,
    dateStart: row.date_start,
    dateEnd: row.date_end,
    timeNeeded: row.time_needed,
    purpose: row.purpose,
    status: row.status,
    attempt: row.attempt,
    vehicleId: row.vehicle_id ?? undefined,
    vehicleType: row.vehicle_type ?? undefined,
    plateNo: row.plate_no ?? undefined,
    reviewRemarks: row.review_remarks ?? undefined,
    approvedAt: isoTimestamp(row.approved_at),
    createdAt: isoTimestamp(row.created_at) ?? "",
    submittedAt: isoTimestamp(row.submitted_at) ?? "",
    destinations: destinations.map((d) => String(d["destination"])),
    signatures: signatures.map((s): SignatureRecord => ({
      stage: s.stage,
      attempt: s.attempt,
      signerId: s.signer_id ?? undefined,
      signerName: s.signer_name,
      proxySignerName: s.proxy_signer_name ?? undefined,
      signerRole: s.signer_role,
      image: s.image ?? undefined,
      method: s.method,
      remarks: s.remarks ?? undefined,
      at: isoTimestamp(s.signed_at) ?? "",
    })),
    history: history.map((h): HistoryEvent => ({
      id: h.id,
      at: isoTimestamp(h.happened_at) ?? "",
      attempt: h.attempt,
      ...(h.actor_id ? { actorId: h.actor_id } : {}),
      actorName: h.actor_name,
      actorRole: h.actor_role,
      type: h.type,
      message: h.message,
      reason: h.reason ?? undefined,
    })),
    lastReturn: lastReturn
      ? {
          stage: lastReturn.stage,
          ...(lastReturn.by_id ? { byId: lastReturn.by_id } : {}),
          byName: lastReturn.by_name,
          byRole: lastReturn.by_role,
          reason: lastReturn.reason,
          at: isoTimestamp(lastReturn.returned_at) ?? "",
          attempt: lastReturn.attempt,
        }
      : undefined,
    dispatch: dispatch
      ? {
          dispatchedBy: dispatch.dispatched_by ?? undefined,
          timeOut: isoTimestamp(dispatch.time_out),
          timeIn: isoTimestamp(dispatch.time_in),
          userSignatureName: dispatch.user_signature_name ?? undefined,
          odometerStart: dispatch.odometer_start ?? undefined,
          odometerEnd: dispatch.odometer_end ?? undefined,
          driverReport: dispatch.driver_report ?? undefined,
          driverName: dispatch.driver_name ?? undefined,
          completedAt: isoTimestamp(dispatch.completed_at),
        }
      : {},
  };
}

export function mapNotification(row: NotificationDbRow): EmailMessage {
  return {
    id: row.id,
    at: isoTimestamp(row.created_at) ?? "",
    toUserId: row.to_user_id,
    toName: row.to_name,
    toEmail: row.to_email,
    subject: row.subject,
    requestId: row.request_id,
    requestNumber: row.request_number,
    kind: row.kind,
    stage: row.stage ?? undefined,
    heading: row.heading,
    body: row.body,
    ctaLabel: row.cta_label,
    read: row.read_at !== null,
    emailDeliveryStatus: row.email_status ?? undefined,
    emailDeliveryMessage: row.email_error ?? undefined,
  };
}
