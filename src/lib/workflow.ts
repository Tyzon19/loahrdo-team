import type {
  EmailKind,
  EmailMessage,
  HistoryEvent,
  RequestInput,
  Role,
  SignatureRecord,
  StageKey,
  Status,
  User,
  Vehicle,
  VehicleRequest,
} from "./types";

/** The approval order is Head of Transport Services, Director, then President. */
export const STAGES: {
  key: StageKey;
  role: Role;
  status: Status;
  label: string;
  title: string;
}[] = [
  {
    key: "review",
    role: "transport_head",
    status: "pending_review",
    label: "Reviewed By",
    title: "Head of Transport Services",
  },
  {
    key: "recommend",
    role: "director",
    status: "pending_recommendation",
    label: "Recommending Approval",
    title: "Director for Administration",
  },
  {
    key: "approve",
    role: "president",
    status: "pending_approval",
    label: "Approved By",
    title: "President",
  },
];

export const ROLE_TITLES: Record<Role, string> = {
  requisitioner: "Requestor",
  department_head: "HRDO Department Head",
  transport_head: "Head of Transport Services",
  director: "Director for Administration",
  president: "President",
  transport_staff: "Transport Personnel",
  assistant: "Alternate Signatory",
  guard: "Guard on Duty",
  driver: "Driver",
  admin: "System Administrator",
};

export const STATUS_LABELS: Record<Status, string> = {
  pending_review: "Awaiting Transport Review",
  pending_recommendation: "Awaiting Recommendation",
  pending_approval: "Awaiting Final Approval",
  returned: "Returned",
  approved: "Approved",
  dispatched: "Dispatched",
  completed: "Trip Completed",
};

export class WorkflowError extends Error {}

export interface Ctx {
  users: User[];
  now: string;
  newId: () => string;
}

export function stageForStatus(status: Status) {
  return STAGES.find((s) => s.status === status);
}

export function pendingWith(status: Status): string {
  const s = stageForStatus(status);
  if (s) return s.title;
  if (status === "returned") return "Requisitioner";
  if (status === "approved" || status === "dispatched") return "Transport Personnel";
  return "—";
}

export function currentSignatures(r: VehicleRequest) {
  return r.signatures.filter((s) => s.attempt === r.attempt);
}

export function canAct(r: VehicleRequest, user: User) {
  const s = stageForStatus(r.status);
  return !!s && s.role === user.role;
}

export function validateRequestInput(
  input: RequestInput,
  today?: string,
): Partial<Record<keyof RequestInput, string>> {
  type E = Partial<Record<keyof RequestInput, string>>;
  const e: E = {};
  if (!input.department.trim()) e.department = "Enter your department or office.";
  const dests = input.destinations.map((d) => d.trim()).filter(Boolean);
  if (dests.length === 0) e.destinations = "Enter your destinations.";
  if (!Number.isInteger(input.passengers) || input.passengers < 1)
    e.passengers = "Enter the number of passengers (at least 1).";
  else if (input.passengers > 60)
    e.passengers = "For more than 60 passengers, please file separate requests.";
  if (!input.dateStart) e.dateStart = "Choose the start date.";
  else if (today && input.dateStart < today) e.dateStart = "The start date cannot be in the past.";
  if (!input.dateEnd) e.dateEnd = "Choose the end date.";
  else if (input.dateStart && input.dateEnd < input.dateStart)
    e.dateEnd = "The end date must be on or after the start date.";
  if (!input.timeNeeded) e.timeNeeded = "Choose the time the vehicle is needed.";
  if (input.purpose.trim().length < 5)
    e.purpose = "Describe the purpose of travel (at least 5 characters).";
  return e;
}

function ev(
  ctx: Ctx,
  r: VehicleRequest,
  actor: User,
  type: HistoryEvent["type"],
  message: string,
  reason?: string,
): HistoryEvent {
  return {
    id: ctx.newId(),
    at: ctx.now,
    attempt: r.attempt,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    type,
    message,
    reason,
  };
}

function usersByRole(ctx: Ctx, role: Role) {
  return ctx.users.filter((u) => u.role === role);
}

const EMAIL_COPY: Record<EmailKind, { subject: string; heading: string; cta: string }> = {
  action_review: {
    subject: "Action Required",
    heading: "A vehicle request is waiting for your review.",
    cta: "Review and Sign Request",
  },
  action_recommend: {
    subject: "Action Required",
    heading: "A vehicle request is waiting for your transport review.",
    cta: "Review and Sign Request",
  },
  action_approve: {
    subject: "Final Approval Required",
    heading: "A vehicle request is waiting for your final approval.",
    cta: "Review and Sign Request",
  },
  returned: {
    subject: "Request Returned",
    heading: "Your vehicle request has been returned.",
    cta: "Revise Request",
  },
  approved_requester: {
    subject: "Trip Ticket Ready",
    heading: "Your vehicle request has received final approval.",
    cta: "View Trip Ticket",
  },
  approved_transport: {
    subject: "Approved Trip Ready for Dispatch",
    heading: "An approved trip is ready for dispatch preparation.",
    cta: "Open Dispatch Record",
  },
  trip_ticket_reminder: {
    subject: "Action Needed: Trip Ticket Not Sent",
    heading: "The official trip ticket has not been sent to the requestor yet.",
    cta: "Prepare Trip Ticket",
  },
};

export function makeEmails(
  ctx: Ctx,
  r: VehicleRequest,
  kind: EmailKind,
  to: User[],
  body: string,
  stage?: StageKey,
): EmailMessage[] {
  const c = EMAIL_COPY[kind];
  return to.map((u) => ({
    id: ctx.newId(),
    at: ctx.now,
    toUserId: u.id,
    toName: u.name,
    toEmail: u.email,
    subject: `[LOA Vehicle Request] ${c.subject} — ${r.number}`,
    requestId: r.id,
    requestNumber: r.number,
    kind,
    stage,
    heading: c.heading,
    body,
    ctaLabel: c.cta,
    read: false,
  }));
}

export function createRequest(ctx: Ctx, input: RequestInput, actor: User, number: string) {
  if (actor.role !== "requisitioner")
    throw new WorkflowError("Only requestors can submit vehicle requests.");
  const r: VehicleRequest = {
    ...input,
    destinations: input.destinations.map((d) => d.trim()).filter(Boolean),
    id: ctx.newId(),
    number,
    createdAt: ctx.now,
    submittedAt: ctx.now,
    requisitionerId: actor.id,
    requisitionerName: actor.name,
    status: "pending_review",
    attempt: 1,
    signatures: [],
    history: [],
    dispatch: {},
  };
  r.history.push(ev(ctx, r, actor, "submitted", "Submitted the request."));
  const emails = makeEmails(
    ctx,
    r,
    "action_review",
    usersByRole(ctx, "transport_head"),
    "Please review the request details, record the vehicle type and plate number if available, then sign and forward it.",
    "review",
  );
  return { request: r, emails };
}

export interface ReviewExtras {
  vehicleId?: string | undefined;
  vehicleType?: string | undefined;
  plateNo?: string | undefined;
  remarks?: string | undefined;
}

export function approveStage(
  ctx: Ctx,
  r: VehicleRequest,
  actor: User,
  sig: {
    image?: string;
    method: SignatureRecord["method"];
    proxySignerName?: string | undefined;
  },
  extras: ReviewExtras = {},
  authorizedProxy = false,
  authorizedMainSignatory = false,
) {
  const stage = stageForStatus(r.status);
  if (!stage) throw new WorkflowError("This request is not waiting for an approval decision.");
  if (stage.role !== actor.role && !authorizedProxy && !authorizedMainSignatory) {
    throw new WorkflowError(
      `This step must be completed by the ${stage.title} or assigned alternate.`,
    );
  }
  if (!sig.image) throw new WorkflowError("A signature is required.");
  const proxySignerName = sig.proxySignerName?.trim();
  if (sig.proxySignerName !== undefined && !proxySignerName) {
    throw new WorkflowError("The alternate signatory name is required.");
  }
  if (Boolean(proxySignerName) !== authorizedProxy) {
    throw new WorkflowError("Only the assigned alternate may sign as a proxy.");
  }
  if (authorizedProxy && authorizedMainSignatory) {
    throw new WorkflowError("The same account cannot be both the main and alternate signatory.");
  }

  const next: VehicleRequest = { ...r, signatures: [...r.signatures], history: [...r.history] };
  if (stage.key === "review") {
    next.vehicleId = extras.vehicleId;
    next.vehicleType = extras.vehicleType?.trim() || undefined;
    next.plateNo = extras.plateNo?.trim() || undefined;
    next.reviewRemarks = extras.remarks?.trim() || undefined;
  }
  next.signatures.push({
    stage: stage.key,
    attempt: r.attempt,
    signerId: actor.id,
    signerName: actor.name,
    proxySignerName,
    signerRole: actor.role,
    image: sig.image,
    method: sig.method,
    at: ctx.now,
    remarks: extras.remarks?.trim() || undefined,
  });

  let emails: EmailMessage[] = [];
  if (stage.key === "review") {
    next.status = "pending_recommendation";
    next.history.push(
      ev(
        ctx,
        next,
        actor,
        "signed",
        proxySignerName
          ? `Reviewed and signed by ${proxySignerName} as alternate for the Head of Transport Services; forwarded to the Director for Administration.`
          : "Reviewed, signed and forwarded to the Director for Administration.",
      ),
    );
    emails = makeEmails(
      ctx,
      next,
      "action_recommend",
      usersByRole(ctx, "director"),
      "The Head of Transport Services has reviewed this request. Your recommending approval is required.",
      "recommend",
    );
  } else if (stage.key === "recommend") {
    next.status = "pending_approval";
    next.history.push(
      ev(
        ctx,
        next,
        actor,
        "signed",
        proxySignerName
          ? `Recommendation signed by ${proxySignerName} as alternate for the Director for Administration; forwarded to the President.`
          : "Recommended, signed and forwarded to the President.",
      ),
    );
    emails = makeEmails(
      ctx,
      next,
      "action_approve",
      usersByRole(ctx, "president"),
      "The request has been reviewed by the Head of Transport Services and recommended by the Director for Administration. Your final approval is required.",
      "approve",
    );
  } else {
    next.status = "approved";
    next.approvedAt = ctx.now;
    next.history.push(
      ev(
        ctx,
        next,
        actor,
        "approved",
        proxySignerName
          ? `Final approval signed by ${proxySignerName} as alternate for the President.`
          : "Granted final approval and signed.",
      ),
    );
    const requester = ctx.users.filter((u) => u.id === r.requisitionerId);
    emails = [
      ...makeEmails(
        ctx,
        next,
        "approved_requester",
        requester,
        "Your request has been approved by the President. The official trip ticket will be attached to this notification when it is prepared.",
      ),
      ...makeEmails(
        ctx,
        next,
        "approved_transport",
        usersByRole(ctx, "transport_staff"),
        "Please prepare the vehicle and dispatch record for this approved trip.",
      ),
      ...makeEmails(
        ctx,
        next,
        "trip_ticket_reminder",
        [actor],
        `You gave final approval for ${r.number}, but the official trip ticket is still waiting to be sent. Please prepare it and send it to the requestor.`,
        "approve",
      ),
    ];
  }
  return { request: next, emails };
}

export function rejectStage(
  ctx: Ctx,
  r: VehicleRequest,
  actor: User,
  reason: string,
  authorizedProxy = false,
  authorizedMainSignatory = false,
) {
  const stage = stageForStatus(r.status);
  if (!stage) throw new WorkflowError("This request is not waiting for an approval decision.");
  if (stage.role !== actor.role && !authorizedProxy && !authorizedMainSignatory)
    throw new WorkflowError(
      `This step must be completed by the ${stage.title} or assigned alternate.`,
    );
  const why = reason.trim();
  if (why.length < 5) throw new WorkflowError("Please give a reason for returning the request.");
  const next: VehicleRequest = {
    ...r,
    status: "returned",
    history: [...r.history],
    lastReturn: {
      stage: stage.key,
      byId: actor.id,
      byName: actor.name,
      byRole: actor.role,
      reason: why,
      at: ctx.now,
      attempt: r.attempt,
    },
  };
  next.history.push(
    ev(
      ctx,
      next,
      actor,
      "returned",
      authorizedProxy
        ? `Returned the request to the requisitioner as the assigned alternate for the ${stage.title}.`
        : "Returned the request to the requisitioner.",
      why,
    ),
  );
  const requester = ctx.users.filter((u) => u.id === r.requisitionerId);
  const emails = makeEmails(
    ctx,
    next,
    "returned",
    requester,
    `${authorizedProxy ? `Returned by the assigned alternate for the ${stage.title}` : `Returned by the ${stage.title}`}. Reason: ${why}`,
  );
  return { request: next, emails };
}

export function resubmit(ctx: Ctx, r: VehicleRequest, actor: User, input: RequestInput) {
  if (r.status !== "returned")
    throw new WorkflowError("Only returned requests can be resubmitted.");
  if (actor.id !== r.requisitionerId)
    throw new WorkflowError("Only the original requestor can resubmit this request.");
  const next: VehicleRequest = {
    ...r,
    ...input,
    destinations: input.destinations.map((d) => d.trim()).filter(Boolean),
    status: "pending_review",
    attempt: r.attempt + 1,
    submittedAt: ctx.now,
    vehicleId: undefined,
    vehicleType: undefined,
    plateNo: undefined,
    reviewRemarks: undefined,
    history: [...r.history],
  };
  next.history.push(
    ev(
      ctx,
      next,
      actor,
      "resubmitted",
      `Revised and resubmitted (attempt ${next.attempt}). Approval restarts with the Head of Transport Services.`,
    ),
  );
  const emails = makeEmails(
    ctx,
    next,
    "action_review",
    usersByRole(ctx, "transport_head"),
    "This request was revised and resubmitted. All approval stages must be completed again.",
    "review",
  );
  return { request: next, emails };
}

export function updatePendingRequest(
  ctx: Ctx,
  r: VehicleRequest,
  actor: User,
  input: RequestInput,
) {
  if (r.status !== "pending_review" || currentSignatures(r).length > 0) {
    throw new WorkflowError(
      "This request can no longer be edited because the Head of Transport Services has signed it.",
    );
  }
  if (actor.id !== r.requisitionerId) {
    throw new WorkflowError("Only the original requisitioner can edit this request.");
  }
  const next: VehicleRequest = {
    ...r,
    ...input,
    destinations: input.destinations.map((destination) => destination.trim()).filter(Boolean),
    history: [...r.history],
  };
  next.history.push(
    ev(ctx, next, actor, "updated", "Updated the request before transport review."),
  );
  return next;
}

function overlaps(a1: string, a2: string, b1: string, b2: string) {
  return a1 <= b2 && b1 <= a2;
}

export function vehicleConflicts(
  vehicleId: string,
  r: Pick<VehicleRequest, "id" | "dateStart" | "dateEnd">,
  all: Pick<VehicleRequest, "id" | "vehicleId" | "dateStart" | "dateEnd" | "status" | "number">[],
) {
  return all.filter(
    (o) =>
      o.id !== r.id &&
      o.vehicleId === vehicleId &&
      o.status !== "returned" &&
      o.status !== "completed" &&
      overlaps(o.dateStart, o.dateEnd, r.dateStart, r.dateEnd),
  );
}

export function vehicleWarnings(
  v: Vehicle | undefined,
  r: VehicleRequest,
  all: Pick<VehicleRequest, "id" | "vehicleId" | "dateStart" | "dateEnd" | "status" | "number">[],
): string[] {
  if (!v) return [];
  const w: string[] = [];
  if (v.status === "maintenance") w.push("This vehicle is marked as under maintenance.");
  const c = vehicleConflicts(v.id, r, all);
  if (c.length) w.push(`Overlapping reservation: ${c.map((x) => x.number).join(", ")}.`);
  return w;
}
export type DispatchField = keyof Omit<import("./types").DispatchRecord, "completedAt">;

export const DISPATCH_PERMISSIONS: Record<DispatchField, Role[]> = {
  dispatchedBy: ["transport_staff", "transport_head"],
  timeOut: ["guard"],
  timeIn: ["guard"],
  userSignatureName: ["transport_staff", "transport_head"],
  odometerStart: ["driver", "transport_staff"],
  odometerEnd: ["driver", "transport_staff"],
  driverReport: ["driver"],
  driverName: ["driver", "transport_staff"],
};

export function missingForCompletion(d: import("./types").DispatchRecord): string[] {
  const m: string[] = [];
  if (!d.dispatchedBy) m.push("Dispatched By");
  if (!d.timeOut) m.push("Date/Time Out");
  if (!d.timeIn) m.push("Date/Time In");
  if (d.odometerStart == null) m.push("Odometer Start");
  if (d.odometerEnd == null) m.push("Odometer End");
  if (d.odometerStart != null && d.odometerEnd != null && d.odometerEnd < d.odometerStart)
    m.push("Odometer End must be at least the start reading");
  if (!d.driverName) m.push("Driver's Name");
  if (!d.driverReport) m.push("Driver's Report");
  return m;
}
