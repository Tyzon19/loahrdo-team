export type Role =
  | "requisitioner"
  | "transport_head"
  | "director"
  | "president"
  | "transport_staff"
  | "assistant"
  | "guard"
  | "driver"
  | "admin";

export interface User {
  id: string;
  name: string;
  role: Role;
  department: string;
  email: string;
}

export interface SignatoryContact {
  userId: string;
  name: string;
  role: Role;
  phoneNumber?: string | undefined;
}

/** Server-verified account for the current session. Never built from client input. */
export interface Viewer extends User {
  mustChangePassword: boolean;
}

/** Minimal, non-sensitive row used by request lists. */
export interface RequestRow {
  id: string;
  number: string;
  requisitionerName: string;
  submittedAt: string;
  dateStart: string;
  dateEnd: string;
  destinations: string[];
  status: Status;
}

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type Status =
  | "pending_review"
  | "pending_recommendation"
  | "pending_approval"
  | "returned"
  | "approved"
  | "dispatched"
  | "completed";

export type StageKey = "review" | "recommend" | "approve";

export interface SignatureRecord {
  stage: StageKey;
  attempt: number;
  signerId?: string | undefined;
  signerName: string;
  proxySignerName?: string | undefined;
  signerRole: Role;
  image?: string | undefined;
  method: "drawn" | "uploaded";
  at: string;
  remarks?: string | undefined;
}

export interface HistoryEvent {
  id: string;
  at: string;
  attempt: number;
  actorId?: string | undefined;
  actorName: string;
  actorRole: Role;
  type:
    | "submitted"
    | "updated"
    | "signed"
    | "returned"
    | "resubmitted"
    | "approved"
    | "dispatch"
    | "completed";
  message: string;
  reason?: string | undefined;
}

export interface ReturnInfo {
  stage: StageKey;
  byId?: string | undefined;
  byName: string;
  byRole: Role;
  reason: string;
  at: string;
  attempt: number;
}

export interface DispatchRecord {
  dispatchedBy?: string | undefined;
  timeOut?: string | undefined;
  timeIn?: string | undefined;
  userSignatureName?: string | undefined;
  odometerStart?: number | undefined;
  odometerEnd?: number | undefined;
  driverReport?: string | undefined;
  driverName?: string | undefined;
  completedAt?: string | undefined;
}

export interface RequestInput {
  department: string;
  destinations: string[];
  passengers: number;
  dateStart: string;
  dateEnd: string;
  timeNeeded: string;
  purpose: string;
}

export interface VehicleRequest extends RequestInput {
  id: string;
  number: string;
  createdAt: string;
  submittedAt: string;
  requisitionerId: string;
  requisitionerName: string;
  status: Status;
  attempt: number;
  vehicleId?: string | undefined;
  vehicleType?: string | undefined;
  plateNo?: string | undefined;
  reviewRemarks?: string | undefined;
  signatures: SignatureRecord[];
  history: HistoryEvent[];
  lastReturn?: ReturnInfo | undefined;
  approvedAt?: string | undefined;
  dispatch: DispatchRecord;
}

export interface Vehicle {
  id: string;
  type: string;
  plateNo: string;
  capacity: number;
  status: "in_service" | "maintenance";
}

export interface DashboardStats {
  total: number;
  pending: number;
  returned: number;
  approved: number;
  completed: number;
  awaitingYou: number;
  thisMonth: number;
  pageViews30d: number | null;
}

export interface ConflictCandidate {
  id: string;
  number: string;
  vehicleId?: string | undefined;
  dateStart: string;
  dateEnd: string;
  status: Status;
}

export interface RequestDetail {
  request: VehicleRequest;
  tripTicketAttached: boolean;
  ticketVerificationToken?: string | undefined;
  doc: DocConfig;
  approverNames: Partial<Record<StageKey, string>>;
  approverUserIds: Partial<Record<StageKey, string>>;
  assistantNames: Partial<Record<StageKey, string>>;
  assistantUserIds: Partial<Record<StageKey, string>>;
  vehicles: Vehicle[];
  conflictCandidates: ConflictCandidate[];
}

export interface VehicleReservation {
  vehicleId: string;
  number: string;
  dateStart: string;
  dateEnd: string;
}

export type EmailKind =
  | "action_review"
  | "action_recommend"
  | "action_approve"
  | "returned"
  | "approved_requester"
  | "approved_transport"
  | "trip_ticket_reminder";

export interface EmailMessage {
  id: string;
  at: string;
  toUserId: string;
  toName: string;
  toEmail: string;
  subject: string;
  requestId: string;
  requestNumber: string;
  kind: EmailKind;
  stage?: StageKey | undefined;
  heading: string;
  body: string;
  ctaLabel: string;
  read: boolean;
  emailDeliveryStatus?: "pending" | "sent" | "failed" | undefined;
  emailDeliveryMessage?: string | undefined;
}

export interface DocConfig {
  institution: string;
  certification: string;
  office: string;
  title: string;
  docNo: string;
  revisionNo: string;
  effectiveDate: string;
}
