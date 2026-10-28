/**
 * Shared types, labels and pure helpers for the HRDO Certificate of Employment (COE) system.
 *
 * This is a separate system from the PFMO vehicle reservation and trip ticket app:
 * it has its own accounts, sessions and database tables. The two systems live in
 * one project, but nothing is shared between their sign-ins.
 */

export const HRDO = {
  name: "LOA HRDO Certificate of Employment",
  shortName: "HRDO COE",
  institution: "Lyceum of Alabang",
  office: "Human Resources Development Office",
  description:
    "Request and track a Certificate of Employment (COE) from the Lyceum of Alabang Human Resources Development Office.",
  contactEmail: "itm@lyceumalabang.edu.ph",
} as const;

/** HR policy: a COE request must be processed within three days of submission. */
export const COE_PROCESSING_DAYS = 3;
/** A request counts as "due soon" inside this window before its deadline. */
export const COE_DUE_SOON_HOURS = 24;
/** Largest signed PDF HR can attach to a request. */
export const COE_MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export type HrdoRole = "employee" | "hrdo_staff";

/** Server-verified HRDO account for the current HRDO session. */
export interface HrdoViewer {
  id: string;
  name: string;
  email: string;
  role: HrdoRole;
  department: string;
  mustChangePassword: boolean;
}

export type CoeCopyType = "soft" | "original" | "both";

export const COE_COPY_TYPES: CoeCopyType[] = ["soft", "original", "both"];

export const COE_COPY_TYPE_LABELS: Record<CoeCopyType, string> = {
  soft: "Soft copy",
  original: "Original",
  both: "Both",
};

export const COE_COPY_TYPE_HINTS: Record<CoeCopyType, string> = {
  soft: "A signed PDF is released online once HRDO finalizes it.",
  original: "A printed, signed copy is released at the HRDO desk.",
  both: "A signed PDF is released online and a printed copy is prepared for pickup.",
};

/** Copy types that include an online signed PDF. */
export function coeNeedsDocument(copyType: CoeCopyType) {
  return copyType === "soft" || copyType === "both";
}

export type CoeStatus =
  | "pending"
  | "under_review"
  | "correction_requested"
  | "processing"
  | "ready_for_pickup"
  | "released"
  | "rejected";

export const COE_STATUSES: CoeStatus[] = [
  "pending",
  "under_review",
  "correction_requested",
  "processing",
  "ready_for_pickup",
  "released",
  "rejected",
];

/** Statuses that still count against the processing deadline. */
export const COE_OPEN_STATUSES: CoeStatus[] = [
  "pending",
  "under_review",
  "correction_requested",
  "processing",
];

export function isCoeOpen(status: CoeStatus) {
  return COE_OPEN_STATUSES.includes(status);
}

/** HRDO staff wording. */
export const COE_STATUS_LABELS: Record<CoeStatus, string> = {
  pending: "New",
  under_review: "Under review",
  correction_requested: "Correction requested",
  processing: "Under processing",
  ready_for_pickup: "Ready for pickup",
  released: "Released",
  rejected: "Rejected",
};

/** Employee-facing wording for the same statuses. */
export const COE_REQUESTOR_STATUS_LABELS: Record<CoeStatus, string> = {
  pending: "Submitted",
  under_review: "Under review",
  correction_requested: "Needs action",
  processing: "Processing",
  ready_for_pickup: "Ready for pickup",
  released: "Released",
  rejected: "Not approved",
};

/** Shown on the requestor dashboard and request details for each status. */
export const COE_STATUS_HINTS: Record<CoeStatus, string> = {
  pending: "HRDO has received your request and will review it shortly.",
  under_review: "HRDO is verifying your information against official HR records.",
  correction_requested:
    "HRDO needs more information. Open the request, read the message and submit the corrected details.",
  processing: "Your Certificate of Employment is being prepared and signed.",
  ready_for_pickup: "Your printed COE is ready. Claim it at the HRDO desk.",
  released: "Your Certificate of Employment has been released.",
  rejected: "HRDO could not process this request. Review the remarks and submit a new request.",
};

export type CoeDeadlineState = "on_track" | "due_soon" | "overdue" | "closed";

export interface CoeDeadlineInfo {
  state: CoeDeadlineState;
  label: string;
  detail: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deadline health for a request. The deadline is fixed at submission time and is
 * never reset by a correction, so an overdue request stays overdue.
 */
export function coeDeadlineInfo(
  deadlineAt: string,
  status: CoeStatus,
  now: Date = new Date(),
): CoeDeadlineInfo {
  const deadline = Date.parse(deadlineAt);
  if (!Number.isFinite(deadline)) {
    return {
      state: "closed",
      label: "No deadline",
      detail: "This request has no recorded deadline.",
    };
  }
  if (!isCoeOpen(status)) {
    return {
      state: "closed",
      label: "Completed",
      detail: "This request is no longer against the deadline.",
    };
  }

  const remainingMs = deadline - now.getTime();
  const days = Math.ceil(Math.abs(remainingMs) / DAY_MS);
  if (remainingMs < 0) {
    return {
      state: "overdue",
      label: "Overdue",
      detail: `${days} day${days === 1 ? "" : "s"} past the three-day deadline.`,
    };
  }
  if (remainingMs <= COE_DUE_SOON_HOURS * 60 * 60 * 1000) {
    return {
      state: "due_soon",
      label: "Due soon",
      detail: remainingMs <= 0 ? "Deadline has passed." : "Less than a day left to process.",
    };
  }
  return {
    state: "on_track",
    label: "On track",
    detail: `${days} day${days === 1 ? "" : "s"} left to process.`,
  };
}

export interface CoeHistoryEntry {
  id: string;
  requestId: string;
  actorName: string;
  actorRole: HrdoRole | "system";
  type: CoeHistoryType;
  message: string;
  happenedAt: string;
}

export type CoeHistoryType =
  | "submitted"
  | "verified"
  | "correction_requested"
  | "resubmitted"
  | "processing"
  | "document_uploaded"
  | "ready_for_pickup"
  | "released"
  | "rejected";

export const COE_HISTORY_LABELS: Record<CoeHistoryType, string> = {
  submitted: "Request submitted",
  verified: "Information verified",
  correction_requested: "Correction requested",
  resubmitted: "Corrected details submitted",
  processing: "Processing started",
  document_uploaded: "Signed COE uploaded",
  ready_for_pickup: "Ready for pickup",
  released: "Document released",
  rejected: "Request rejected",
};

/** A history entry shown in the HR-wide request history page. */
export interface CoeHistoryRecord extends CoeHistoryEntry {
  employeeName: string;
  employeeNumber: string;
}

export interface CoeRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  employeeNumber: string;
  department: string;
  purpose: string;
  note: string;
  copyType: CoeCopyType;
  status: CoeStatus;
  remarks: string;
  correctionMessage: string;
  processedByName: string;
  requestedAt: string;
  deadlineAt: string;
  updatedAt: string;
  verifiedAt: string;
  verifiedByName: string;
  correctionRequestedAt: string;
  finalizedAt: string;
  readyAt: string;
  releasedAt: string;
  releasedByName: string;
  receivedByName: string;
  hasDocument: boolean;
  documentFileName: string;
  history: CoeHistoryEntry[];
}

/** Staff actions available for a request in its current state. */
export type CoeAction =
  | "verify"
  | "process"
  | "request_correction"
  | "upload_document"
  | "mark_ready"
  | "release"
  | "reject";

export function coeStaffActions(request: {
  status: CoeStatus;
  copyType: CoeCopyType;
  verifiedAt: string;
  hasDocument: boolean;
}): CoeAction[] {
  switch (request.status) {
    case "pending":
    case "under_review": {
      const actions: CoeAction[] = [];
      if (!request.verifiedAt) actions.push("verify");
      else actions.push("process");
      actions.push("request_correction", "reject");
      return actions;
    }
    case "processing": {
      const actions: CoeAction[] = [];
      if (coeNeedsDocument(request.copyType) && !request.hasDocument) {
        actions.push("upload_document");
      }
      const readyPossible =
        request.copyType === "original" || (request.copyType === "both" && request.hasDocument);
      if (readyPossible) actions.push("mark_ready");
      actions.push("request_correction", "reject");
      return actions;
    }
    case "ready_for_pickup":
      return ["release"];
    case "correction_requested":
    case "released":
    case "rejected":
      return [];
  }
}

export function coeCanDownloadDocument(
  request: Pick<CoeRequest, "hasDocument" | "status">,
  audience: "requestor" | "staff",
): boolean {
  if (!request.hasDocument) return false;
  if (audience === "staff") return true;
  return request.status === "ready_for_pickup" || request.status === "released";
}

/** Summary buckets for the HR admin dashboard. A request can hit more than one. */
export interface HrCoeSummary {
  total: number;
  newCount: number;
  underReview: number;
  processing: number;
  dueSoon: number;
  overdue: number;
  readyForPickup: number;
  released: number;
}

export function hrCoeSummary(
  requests: Array<Pick<CoeRequest, "status" | "deadlineAt">>,
  now: Date = new Date(),
): HrCoeSummary {
  const summary: HrCoeSummary = {
    total: requests.length,
    newCount: 0,
    underReview: 0,
    processing: 0,
    dueSoon: 0,
    overdue: 0,
    readyForPickup: 0,
    released: 0,
  };
  for (const request of requests) {
    if (request.status === "pending") summary.newCount += 1;
    if (request.status === "under_review") summary.underReview += 1;
    if (request.status === "processing") summary.processing += 1;
    if (request.status === "ready_for_pickup") summary.readyForPickup += 1;
    if (request.status === "released") summary.released += 1;
    const deadline = coeDeadlineInfo(request.deadlineAt, request.status, now);
    if (deadline.state === "due_soon") summary.dueSoon += 1;
    if (deadline.state === "overdue") summary.overdue += 1;
  }
  return summary;
}

export type CoeRequestorGroupKey = "review" | "processing" | "action" | "ready";

export interface CoeRequestorGroup {
  key: CoeRequestorGroupKey;
  label: string;
  hint: string;
  statuses: CoeStatus[];
}

/**
 * Employee summary cards. Every status belongs to exactly one group, so the
 * four cards always add up to the employee's total number of requests.
 */
export const COE_REQUESTOR_GROUPS: CoeRequestorGroup[] = [
  {
    key: "review",
    label: "Under Review",
    hint: "Submitted or being verified by HRDO",
    statuses: ["pending", "under_review"],
  },
  {
    key: "processing",
    label: "Processing",
    hint: "COE being prepared by HRDO",
    statuses: ["processing"],
  },
  {
    key: "action",
    label: "Needs Action",
    hint: "Corrections or remarks need your attention",
    statuses: ["correction_requested", "rejected"],
  },
  {
    key: "ready",
    label: "Ready",
    hint: "Ready for pickup or already released",
    statuses: ["ready_for_pickup", "released"],
  },
];

export function coeRequestorCounts(
  requests: Array<Pick<CoeRequest, "status">>,
): Record<CoeRequestorGroupKey, number> {
  const counts: Record<CoeRequestorGroupKey, number> = {
    review: 0,
    processing: 0,
    action: 0,
    ready: 0,
  };
  for (const request of requests) {
    const group = COE_REQUESTOR_GROUPS.find((item) => item.statuses.includes(request.status));
    if (group) counts[group.key] += 1;
  }
  return counts;
}

export type CoeDeadlineFilter = "all" | "due_soon" | "overdue" | "on_track";

export interface CoeFilter {
  q?: string;
  status?: CoeStatus | "all";
  department?: string;
  deadline?: CoeDeadlineFilter;
  copyType?: CoeCopyType | "all";
}

export function filterCoeRequests(
  requests: CoeRequest[],
  filter: CoeFilter,
  now: Date = new Date(),
): CoeRequest[] {
  const query = (filter.q ?? "").trim().toLowerCase();
  const status = filter.status ?? "all";
  const department = filter.department ?? "all";
  const deadlineFilter = filter.deadline ?? "all";
  const copyType = filter.copyType ?? "all";

  return requests.filter((request) => {
    if (status !== "all" && request.status !== status) return false;
    if (department !== "all" && request.department !== department) return false;
    if (copyType !== "all" && request.copyType !== copyType) return false;
    if (deadlineFilter !== "all") {
      const { state } = coeDeadlineInfo(request.deadlineAt, request.status, now);
      if (state !== deadlineFilter) return false;
    }
    if (!query) return true;
    return (
      request.id.toLowerCase().includes(query) ||
      request.purpose.toLowerCase().includes(query) ||
      request.employeeName.toLowerCase().includes(query) ||
      request.employeeNumber.toLowerCase().includes(query) ||
      request.department.toLowerCase().includes(query)
    );
  });
}

export function coeDepartments(requests: Array<Pick<CoeRequest, "department">>): string[] {
  return [...new Set(requests.map((request) => request.department).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Short, human-friendly request reference used in tables and headings. */
export function coeReference(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`;
}
