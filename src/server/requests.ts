import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  DashboardStats,
  EmailMessage,
  EmailKind,
  HistoryEvent,
  RequestDetail,
  RequestInput,
  RequestRow,
  ReturnInfo,
  SignatureRecord,
  Status,
  Vehicle,
  VehicleReservation,
  VehicleRequest,
  Viewer,
} from "@/lib/types";
import {
  canManageVehicles,
  canViewAllRequests,
  canViewRequest,
  isApproverRole,
} from "@/lib/access";
import {
  approveSchema,
  destinationSearchSchema,
  rejectSchema,
  requestFilterSchema,
  requestIdSchema,
  requestInputSchema,
  resubmitSchema,
  sendTripTicketSchema,
  todayISO,
  updatePendingRequestSchema,
  vehicleSchema,
} from "@/lib/validation";
import {
  approveStage,
  createRequest as createWorkflowRequest,
  makeEmails,
  rejectStage,
  resubmit as resubmitWorkflow,
  stageForStatus,
  updatePendingRequest as updatePendingRequestWorkflow,
  WorkflowError,
  type Ctx,
} from "@/lib/workflow";
import { requireViewer } from "./auth";
import { all, getPool, likePattern, run, withTransaction } from "./db";
import { AppError, isDuplicateKey, parseInput } from "@/lib/errors";
import { sendTripTicketTestEmail, sendWorkflowTestEmail } from "./gmail";
import {
  loadApproverNames,
  loadApproverUserIds,
  loadAssistantNames,
  loadAssistantUserIds,
  loadDoc,
  loadRequest,
  loadUsers,
  loadVehicles,
  toDbTimestamp,
  type RequestDbRow,
  type VehicleDbRow,
} from "./mappers";

function canSee(viewer: Viewer, requisitionerId: string) {
  return canViewRequest(viewer, requisitionerId);
}

function assertFutureDate(input: RequestInput) {
  if (input.dateStart < todayISO()) {
    throw new AppError("The start date cannot be in the past.", {
      dateStart: "The start date cannot be in the past.",
    });
  }
}

async function insertHistory(conn: PoolConnection, requestId: string, events: HistoryEvent[]) {
  if (!events.length) return;
  for (const event of events) {
    await run(
      `INSERT INTO request_history
        (id, request_id, attempt, actor_name, actor_role, type, message, reason, happened_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        requestId,
        event.attempt,
        event.actorName,
        event.actorRole,
        event.type,
        event.message.slice(0, 500),
        event.reason ?? null,
        toDbTimestamp(event.at),
      ],
      conn,
    );
  }
}

async function insertSignature(
  conn: PoolConnection,
  requestId: string,
  signature: SignatureRecord,
) {
  await run(
    `INSERT INTO request_signatures
      (id, request_id, stage, attempt, signer_id, signer_name, signer_role, proxy_signer_name, image, method, remarks, signed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      requestId,
      signature.stage,
      signature.attempt,
      signature.signerId,
      signature.signerName,
      signature.signerRole,
      signature.proxySignerName ?? null,
      signature.image ?? null,
      signature.method,
      signature.remarks ?? null,
      toDbTimestamp(signature.at),
    ],
    conn,
  );
}

async function insertNotifications(conn: PoolConnection, emails: EmailMessage[]) {
  if (!emails.length) return;
  const placeholders = emails.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const values = emails.flatMap((email) => [
    email.id,
    email.requestId,
    email.toUserId,
    email.toName,
    email.toEmail,
    email.subject.slice(0, 255),
    email.kind,
    email.stage ?? null,
    email.heading.slice(0, 255),
    email.body,
    email.ctaLabel,
    toDbTimestamp(email.at),
  ]);
  await run(
    `INSERT INTO notifications
      (id, request_id, to_user_id, to_name, to_email, subject, kind, stage, heading, body, cta_label, created_at)
     VALUES ${placeholders}`,
    values,
    conn,
  );
}

async function notifyAssistant(
  conn: PoolConnection,
  emails: EmailMessage[],
  request: VehicleRequest,
  ctx: Ctx,
  stage: "review" | "recommend" | "approve",
) {
  const userId = (await loadAssistantUserIds(conn))[stage];
  if (!userId || emails.some((email) => email.toUserId === userId)) return emails;
  const assistant = ctx.users.find((user) => user.id === userId);
  if (!assistant) return emails;

  const messages: Record<"review" | "recommend" | "approve", { kind: EmailKind; body: string }> = {
    review: {
      kind: "action_review",
      body: "You are assigned as the alternate signatory for the Head of Transport Services.",
    },
    recommend: {
      kind: "action_recommend",
      body: "You are assigned as the alternate signatory for the Director for Administration.",
    },
    approve: {
      kind: "action_approve",
      body: "You are assigned as the alternate signatory for the President.",
    },
  };
  const message = messages[stage];
  return [...emails, ...makeEmails(ctx, request, message.kind, [assistant], message.body, stage)];
}

async function routeMainSignatory(
  conn: PoolConnection,
  emails: EmailMessage[],
  request: VehicleRequest,
  ctx: Ctx,
  stage: "review" | "recommend" | "approve",
) {
  const assignedUserId = (await loadApproverUserIds(conn))[stage];
  if (!assignedUserId) return emails;
  const account = ctx.users.find((user) => user.id === assignedUserId);
  if (!account) {
    throw new AppError("The assigned main signatory account is unavailable.");
  }
  const stageEmails = emails.filter((email) => email.stage === stage);
  const source = stageEmails.find((email) => email.toUserId === assignedUserId) ?? stageEmails[0];
  const routedMessage = source
    ? {
        ...source,
        id: randomUUID(),
        toUserId: account.id,
        toName: account.name,
        toEmail: account.email,
        read: false,
      }
    : makeEmails(
        ctx,
        request,
        stage === "review"
          ? "action_review"
          : stage === "recommend"
            ? "action_recommend"
            : "action_approve",
        [account],
        `You are assigned as the main signatory for the ${
          stage === "review"
            ? "Head of Transport Services"
            : stage === "recommend"
              ? "Director for Administration"
              : "President"
        }.`,
        stage,
      )[0];
  if (!routedMessage) return emails;
  return [...emails.filter((email) => email.stage !== stage), routedMessage];
}

async function insertDestinations(conn: PoolConnection, requestId: string, destinations: string[]) {
  for (const [index, destination] of destinations.entries()) {
    await run(
      "INSERT INTO request_destinations (request_id, sort_order, destination) VALUES (?, ?, ?)",
      [requestId, index, destination],
      conn,
    );
  }
}

function signatureBytes(dataUrl: string) {
  const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new AppError("The signature image is not valid.");
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.length > 1_000_000) {
    throw new AppError("The signature image must be 1 MB or smaller.");
  }
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((match[1] === "png" && !png) || (match[1] === "jpeg" && !jpeg)) {
    throw new AppError("The signature image is not valid.");
  }
}

/* ------------------------------- Reads ------------------------------- */

export async function listRequests(input: unknown): Promise<RequestRow[]> {
  const viewer = await requireViewer();
  const filter = parseInput(requestFilterSchema, input ?? {});

  const where: string[] = [];
  const params: unknown[] = [];

  // Requisitioners can only ever see their own records; this is enforced here,
  // not in the browser.
  if (!canViewAllRequests(viewer.role)) {
    where.push("r.requisitioner_id = ?");
    params.push(viewer.id);
  }
  if (filter.status !== "all") {
    where.push("r.status = ?");
    params.push(filter.status);
  }
  if (filter.q) {
    const like = likePattern(filter.q);
    where.push(
      `(r.number LIKE ? OR r.requisitioner_name LIKE ? OR r.department LIKE ? OR r.purpose LIKE ?
        OR EXISTS (SELECT 1 FROM request_destinations d2 WHERE d2.request_id = r.id AND d2.destination LIKE ?))`,
    );
    params.push(like, like, like, like, like);
  }

  const rows = await all<RequestDbRow[]>(
    `SELECT r.id, r.number, r.requisitioner_name, r.submitted_at, r.status, r.date_start, r.date_end
     FROM requests r
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY r.submitted_at DESC
     LIMIT 300`,
    params,
  );
  if (!rows.length) return [];

  const ids = rows.map((row) => row.id);
  const destinations = await all<RowDataPacket[]>(
    "SELECT request_id, destination FROM request_destinations WHERE request_id IN (?) ORDER BY sort_order",
    [ids],
  );
  const byRequest = new Map<string, string[]>();
  for (const row of destinations) {
    const key = String(row["request_id"]);
    const list = byRequest.get(key) ?? [];
    list.push(String(row["destination"]));
    byRequest.set(key, list);
  }

  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    requisitionerName: row.requisitioner_name,
    submittedAt: row.submitted_at.replace(" ", "T") + "Z",
    dateStart: row.date_start,
    dateEnd: row.date_end,
    destinations: byRequest.get(row.id) ?? [],
    status: row.status,
  }));
}

export async function getDestinationSuggestions(input: unknown): Promise<string[]> {
  const viewer = await requireViewer();
  if (viewer.role !== "requisitioner") {
    throw new AppError("Only requisitioners can search their previous destinations.");
  }
  const query = parseInput(destinationSearchSchema, input);
  const searchPattern = `%${query
    .split(/\s+/)
    .map((term) => likePattern(term).slice(1, -1))
    .join("%")}%`;
  const rows = await all<RowDataPacket[]>(
    `SELECT d.destination
     FROM request_destinations d
     JOIN requests r ON r.id = d.request_id
     WHERE r.requisitioner_id = ? AND d.destination LIKE ?
     ORDER BY r.submitted_at DESC
     LIMIT 50`,
    [viewer.id, searchPattern],
  );
  const normalized = new Set<string>();
  const matches: string[] = [];
  const lowerQuery = query.replace(/\s+/g, " ").toLocaleLowerCase();
  for (const row of rows) {
    const storedDestination = String(row["destination"]).trim().replace(/\s+/g, " ");
    if (!storedDestination.toLocaleLowerCase().includes(lowerQuery)) continue;
    const destination = storedDestination.split(",")[0]?.trim().replace(/\s+/g, " ") ?? "";
    const key = destination.toLocaleLowerCase();
    if (!destination || normalized.has(key)) continue;
    normalized.add(key);
    matches.push(destination);
    if (matches.length === 5) break;
  }
  return matches;
}

async function requestDetail(
  id: unknown,
  includeSignatureImages: boolean,
): Promise<RequestDetail | null> {
  const viewer = await requireViewer();
  if (includeSignatureImages && viewer.role === "requisitioner") {
    throw new AppError("The official trip ticket image is required.");
  }
  const parsed = requestIdSchema.safeParse(id);
  if (!parsed.success) return null;

  const pool = await getPool();
  const request = await loadRequest(
    pool,
    parsed.data,
    viewer.role !== "requisitioner" || includeSignatureImages,
  );
  if (!request || !canSee(viewer, request.requisitionerId)) return null;
  const [doc, approverNames, approverUserIds, assistantNames, assistantUserIds] = await Promise.all(
    [
      loadDoc(pool),
      loadApproverNames(pool),
      loadApproverUserIds(pool),
      loadAssistantNames(pool),
      loadAssistantUserIds(pool),
    ],
  );
  const ticketNotifications = await all<RowDataPacket[]>(
    `SELECT n.id
     FROM notifications n
     JOIN notification_attachments a ON a.notification_id = n.id
     WHERE n.request_id = ? AND n.to_user_id = ? AND n.kind = 'approved_requester'
     LIMIT 1`,
    [request.id, request.requisitionerId],
  );

  const canSeeFleet =
    isApproverRole(viewer.role) ||
    canManageVehicles(viewer.role) ||
    approverUserIds.review === viewer.id;
  const vehicles = canSeeFleet ? await loadVehicles(pool) : [];
  const conflicts = canSeeFleet
    ? await all<RowDataPacket[]>(
        `SELECT id, number, vehicle_id, date_start, date_end, status
         FROM requests
         WHERE status NOT IN ('returned','completed') AND id <> ?`,
        [request.id],
      )
    : [];

  return {
    request,
    tripTicketAttached: ticketNotifications.length > 0,
    doc,
    approverNames,
    approverUserIds: canViewAllRequests(viewer.role) ? approverUserIds : {},
    vehicles,
    assistantNames,
    assistantUserIds: canViewAllRequests(viewer.role) ? assistantUserIds : {},
    conflictCandidates: conflicts.map((row) => ({
      id: String(row["id"]),
      number: String(row["number"]),
      vehicleId: row["vehicle_id"] ? String(row["vehicle_id"]) : undefined,
      dateStart: String(row["date_start"]),
      dateEnd: String(row["date_end"]),
      status: String(row["status"]) as Status,
    })),
  };
}

export function getRequestDetail(id: unknown): Promise<RequestDetail | null> {
  return requestDetail(id, false);
}

export function getPrintableRequestDetail(id: unknown): Promise<RequestDetail | null> {
  return requestDetail(id, true);
}

/* ------------------------------- Writes ------------------------------ */

export async function submitRequest(input: unknown): Promise<{
  id: string;
  number: string;
  workflowEmail?: Awaited<ReturnType<typeof sendWorkflowTestEmail>>;
}> {
  const viewer = await requireViewer();
  if (viewer.role !== "requisitioner") {
    throw new AppError("Only requisitioners can submit vehicle requests.");
  }
  const data = parseInput(requestInputSchema, input);
  assertFutureDate(data);

  const result = await withTransaction(async (conn) => {
    const year = new Date().getFullYear();
    await run(
      `INSERT INTO request_sequences (year, last_number) VALUES (?, 1)
       ON DUPLICATE KEY UPDATE last_number = last_number + 1`,
      [year],
      conn,
    );
    const seqRows = await all<RowDataPacket[]>(
      "SELECT last_number FROM request_sequences WHERE year = ? LIMIT 1",
      [year],
      conn,
    );
    const number = `VR-${year}-${String(Number(seqRows[0]?.["last_number"] ?? 1)).padStart(4, "0")}`;

    const users = await loadUsers(conn);
    const ctx = { users, now: new Date().toISOString(), newId: () => randomUUID() };
    let out;
    try {
      out = createWorkflowRequest(ctx, data, viewer, number);
    } catch (error) {
      if (error instanceof WorkflowError) throw new AppError(error.message);
      throw error;
    }
    const request = out.request;

    await run(
      `INSERT INTO requests
        (id, number, requisitioner_id, requisitioner_name, department, passengers,
         date_start, date_end, time_needed, purpose, status, attempt, created_at, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        request.id,
        request.number,
        request.requisitionerId,
        request.requisitionerName,
        request.department,
        request.passengers,
        request.dateStart,
        request.dateEnd,
        request.timeNeeded,
        request.purpose,
        request.status,
        request.attempt,
        toDbTimestamp(request.createdAt),
        toDbTimestamp(request.submittedAt),
      ],
      conn,
    );
    await insertDestinations(conn, request.id, request.destinations);
    await insertHistory(conn, request.id, request.history);
    const primaryNotifications = await routeMainSignatory(conn, out.emails, request, ctx, "review");
    const notifications = await notifyAssistant(conn, primaryNotifications, request, ctx, "review");
    await insertNotifications(conn, notifications);

    return {
      id: request.id,
      number: request.number,
      request,
      email: notifications.find((message) => message.stage === "review"),
    };
  });
  const workflowEmail = await sendWorkflowTestEmail(result.email, result.request);
  return { id: result.id, number: result.number, ...(workflowEmail ? { workflowEmail } : {}) };
}

async function lockAndLoad(conn: PoolConnection, id: string) {
  const rows = await all<RowDataPacket[]>(
    "SELECT id FROM requests WHERE id = ? FOR UPDATE",
    [id],
    conn,
  );
  if (!rows.length) throw new AppError("We couldn't find this request.");
  const request = await loadRequest(conn, id);
  if (!request) throw new AppError("We couldn't find this request.");
  return request;
}

export async function approveRequest(
  input: unknown,
): Promise<{ status: Status; workflowEmail?: Awaited<ReturnType<typeof sendWorkflowTestEmail>> }> {
  const viewer = await requireViewer();
  const data = parseInput(approveSchema, input);
  signatureBytes(data.signature.image);

  const result = await withTransaction(async (conn) => {
    const request = await lockAndLoad(conn, data.id);
    if (!canSee(viewer, request.requisitionerId)) {
      throw new AppError("You don't have access to this request.");
    }
    const stage = stageForStatus(request.status);
    if (!stage) throw new AppError("This request is not waiting for an approval decision.");
    if (data.driverName !== undefined && stage.key !== "review") {
      throw new AppError("A driver can only be assigned during the transport review stage.");
    }
    const [assistantUserId, assignedMainUserId] = await Promise.all([
      loadAssistantUserIds(conn).then((ids) => ids[stage.key]),
      loadApproverUserIds(conn).then((ids) => ids[stage.key]),
    ]);
    const isProxySigner = assistantUserId === viewer.id;
    const isAssignedMainSignatory = assignedMainUserId === viewer.id;
    const canSignAsMain = assignedMainUserId ? isAssignedMainSignatory : stage.role === viewer.role;
    if (!canSignAsMain && !isProxySigner) {
      throw new AppError(`This step must be completed by the ${stage.title}.`);
    }
    if (data.proxySigner !== isProxySigner) {
      throw new AppError(
        isProxySigner
          ? "Assigned alternate signatories must use the alternate-signatory action."
          : "Only the assigned alternate signatory account can sign at this stage.",
      );
    }
    const proxySignerName = isProxySigner ? viewer.name : undefined;

    let vehicle: Vehicle | undefined;
    if (data.vehicleId) {
      const vehicleRows = await all<VehicleDbRow[]>(
        "SELECT id, type, plate_no, capacity, status FROM vehicles WHERE id = ? LIMIT 1",
        [data.vehicleId],
        conn,
      );
      const row = vehicleRows[0];
      if (!row) {
        throw new AppError("Choose a valid vehicle.", {
          vehicleId: "That vehicle no longer exists.",
        });
      }
      vehicle = {
        id: row.id,
        type: row.type,
        plateNo: row.plate_no,
        capacity: row.capacity,
        status: row.status,
      };
    }

    const users = await loadUsers(conn);
    const ctx = { users, now: new Date().toISOString(), newId: () => randomUUID() };
    let out;
    try {
      out = approveStage(
        ctx,
        request,
        viewer,
        {
          image: data.signature.image,
          method: data.signature.method,
          proxySignerName,
        },
        {
          vehicleId: vehicle?.id,
          // Values come from the stored vehicle record, never from client text.
          vehicleType: vehicle?.type ?? data.vehicleType,
          plateNo: vehicle?.plateNo ?? data.plateNo,
          remarks: data.remarks,
        },
        isProxySigner,
        isAssignedMainSignatory && viewer.role !== stage.role,
      );
    } catch (error) {
      if (error instanceof WorkflowError) throw new AppError(error.message);
      throw error;
    }

    const updated = out.request;
    const result = await run(
      `UPDATE requests
       SET status = ?, attempt = ?, vehicle_id = ?, vehicle_type = ?, plate_no = ?,
           review_remarks = ?, approved_at = ?
       WHERE id = ? AND status = ?`,
      [
        updated.status,
        updated.attempt,
        updated.vehicleId ?? null,
        updated.vehicleType ?? null,
        updated.plateNo ?? null,
        updated.reviewRemarks ?? null,
        toDbTimestamp(updated.approvedAt),
        updated.id,
        request.status,
      ],
      conn,
    );
    if (result.affectedRows !== 1) {
      throw new AppError("This request changed while you were reviewing it. Reload and try again.");
    }

    const newSignature = updated.signatures[updated.signatures.length - 1];
    if (newSignature) await insertSignature(conn, updated.id, newSignature);
    if (stage.key === "review") {
      await run(
        `INSERT INTO dispatch_records (request_id, driver_name) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE driver_name = VALUES(driver_name)`,
        [updated.id, data.driverName?.trim() || null],
        conn,
      );
    }
    await insertHistory(conn, updated.id, updated.history.slice(request.history.length));
    const nextStage = stageForStatus(updated.status);
    const primaryEmails = nextStage
      ? await routeMainSignatory(conn, out.emails, updated, ctx, nextStage.key)
      : out.emails;
    const emails = nextStage
      ? await notifyAssistant(conn, primaryEmails, updated, ctx, nextStage.key)
      : primaryEmails;
    await insertNotifications(conn, emails);

    return {
      status: updated.status,
      request: updated,
      email: nextStage ? emails.find((message) => message.stage === nextStage.key) : undefined,
    };
  });
  const workflowEmail = result.email
    ? await sendWorkflowTestEmail(result.email, result.request)
    : undefined;
  return { status: result.status, ...(workflowEmail ? { workflowEmail } : {}) };
}

export async function rejectRequest(
  input: unknown,
): Promise<{ status: Status; workflowEmail?: Awaited<ReturnType<typeof sendWorkflowTestEmail>> }> {
  const viewer = await requireViewer();
  const data = parseInput(rejectSchema, input);

  const result = await withTransaction(async (conn) => {
    const request = await lockAndLoad(conn, data.id);
    if (!canSee(viewer, request.requisitionerId)) {
      throw new AppError("You don't have access to this request.");
    }

    const stage = stageForStatus(request.status);
    const [assistantUserId, assignedMainUserId] = stage
      ? await Promise.all([
          loadAssistantUserIds(conn).then((ids) => ids[stage.key]),
          loadApproverUserIds(conn).then((ids) => ids[stage.key]),
        ])
      : [undefined, undefined];
    const isProxySigner = assistantUserId === viewer.id;
    const isAssignedMainSignatory = assignedMainUserId === viewer.id;
    const canSignAsMain = stage
      ? assignedMainUserId
        ? isAssignedMainSignatory
        : stage.role === viewer.role
      : false;
    const ctx = {
      users: await loadUsers(conn),
      now: new Date().toISOString(),
      newId: () => randomUUID(),
    };
    let out;
    try {
      out = rejectStage(
        ctx,
        request,
        viewer,
        data.reason,
        isProxySigner,
        canSignAsMain && viewer.role !== stage?.role,
      );
    } catch (error) {
      if (error instanceof WorkflowError) throw new AppError(error.message);
      throw error;
    }

    const updated = out.request;
    const result = await run(
      "UPDATE requests SET status = ? WHERE id = ? AND status = ?",
      [updated.status, updated.id, request.status],
      conn,
    );
    if (result.affectedRows !== 1) {
      throw new AppError("This request changed while you were reviewing it. Reload and try again.");
    }

    const lastReturn = updated.lastReturn as ReturnInfo;
    await run(
      `INSERT INTO request_returns (id, request_id, stage, by_name, by_role, reason, attempt, returned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        updated.id,
        lastReturn.stage,
        lastReturn.byName,
        lastReturn.byRole,
        lastReturn.reason,
        lastReturn.attempt,
        toDbTimestamp(lastReturn.at),
      ],
      conn,
    );
    await insertHistory(conn, updated.id, updated.history.slice(request.history.length));
    const primaryNotifications = await routeMainSignatory(conn, out.emails, updated, ctx, "review");
    const notifications = await notifyAssistant(conn, primaryNotifications, updated, ctx, "review");
    await insertNotifications(conn, notifications);

    return {
      status: updated.status,
      request: updated,
      email: notifications.find((message: EmailMessage) => message.kind === "returned"),
    };
  });
  const workflowEmail = await sendWorkflowTestEmail(result.email, result.request);
  return { status: result.status, ...(workflowEmail ? { workflowEmail } : {}) };
}

export async function resubmitRequest(
  input: unknown,
): Promise<{ id: string; workflowEmail?: Awaited<ReturnType<typeof sendWorkflowTestEmail>> }> {
  const viewer = await requireViewer();
  const data = parseInput(resubmitSchema, input);
  assertFutureDate(data.input);

  const result = await withTransaction(async (conn) => {
    const request = await lockAndLoad(conn, data.id);
    if (request.requisitionerId !== viewer.id) {
      throw new AppError("Only the original requisitioner can resubmit this request.");
    }
    if (request.status !== "returned") {
      throw new AppError("Only returned requests can be resubmitted.");
    }
    const ctx = {
      users: await loadUsers(conn),
      now: new Date().toISOString(),
      newId: () => randomUUID(),
    };
    let out;
    try {
      out = resubmitWorkflow(ctx, request, viewer, data.input);
    } catch (error) {
      if (error instanceof WorkflowError) throw new AppError(error.message);
      throw error;
    }
    const updated = out.request;

    const result = await run(
      `UPDATE requests
       SET department = ?, passengers = ?, date_start = ?, date_end = ?, time_needed = ?,
           purpose = ?, requisitioner_name = ?, status = ?, attempt = ?, submitted_at = ?,
           vehicle_id = NULL, vehicle_type = NULL, plate_no = NULL, review_remarks = NULL
       WHERE id = ? AND status = 'returned' AND attempt = ?`,
      [
        updated.department,
        updated.passengers,
        updated.dateStart,
        updated.dateEnd,
        updated.timeNeeded,
        updated.purpose,
        updated.requisitionerName,
        updated.status,
        updated.attempt,
        toDbTimestamp(updated.submittedAt),
        updated.id,
        request.attempt,
      ],
      conn,
    );
    if (result.affectedRows !== 1) {
      throw new AppError("This request changed while you were editing it. Reload and try again.");
    }
    await run("DELETE FROM request_destinations WHERE request_id = ?", [updated.id], conn);
    await insertDestinations(conn, updated.id, updated.destinations);
    await insertHistory(conn, updated.id, updated.history.slice(request.history.length));
    const primaryEmails = await routeMainSignatory(conn, out.emails, updated, ctx, "review");
    await insertNotifications(conn, primaryEmails);

    return {
      id: updated.id,
      request: updated,
      email: primaryEmails.find((message: EmailMessage) => message.stage === "review"),
    };
  });
  const workflowEmail = await sendWorkflowTestEmail(result.email, result.request);
  return { id: result.id, ...(workflowEmail ? { workflowEmail } : {}) };
}

export async function updatePendingRequest(input: unknown): Promise<{ id: string }> {
  const viewer = await requireViewer();
  if (viewer.role !== "requisitioner") {
    throw new AppError("Only requisitioners can edit vehicle requests.");
  }
  const data = parseInput(updatePendingRequestSchema, input);

  return withTransaction(async (conn) => {
    const request = await lockAndLoad(conn, data.id);
    if (request.requisitionerId !== viewer.id) {
      throw new AppError("Only the original requisitioner can edit this request.");
    }
    if (request.status !== "pending_review") {
      throw new AppError(
        "This request can no longer be edited because the Head of Transport Services has signed it.",
      );
    }
    if (data.input.dateStart !== request.dateStart) assertFutureDate(data.input);
    const ctx = {
      users: [],
      now: new Date().toISOString(),
      newId: () => randomUUID(),
    };
    let updated: VehicleRequest;
    try {
      updated = updatePendingRequestWorkflow(ctx, request, viewer, data.input);
    } catch (error) {
      if (error instanceof WorkflowError) throw new AppError(error.message);
      throw error;
    }

    const result = await run(
      `UPDATE requests
       SET department = ?, passengers = ?, date_start = ?, date_end = ?, time_needed = ?, purpose = ?
       WHERE id = ? AND status = 'pending_review' AND attempt = ?`,
      [
        updated.department,
        updated.passengers,
        updated.dateStart,
        updated.dateEnd,
        updated.timeNeeded,
        updated.purpose,
        updated.id,
        request.attempt,
      ],
      conn,
    );
    if (result.affectedRows !== 1) {
      throw new AppError("This request changed while you were editing it. Reload and try again.");
    }
    await run("DELETE FROM request_destinations WHERE request_id = ?", [updated.id], conn);
    await insertDestinations(conn, updated.id, updated.destinations);
    await insertHistory(conn, updated.id, updated.history.slice(request.history.length));
    return { id: updated.id };
  });
}

export async function sendTripTicket(input: unknown): Promise<{
  alreadySent: boolean;
  testEmail?: Awaited<ReturnType<typeof sendTripTicketTestEmail>>;
}> {
  const viewer = await requireViewer();
  if (!canViewAllRequests(viewer.role)) {
    throw new AppError("Only staff in the approval workflow can send the trip ticket.");
  }
  const data = parseInput(sendTripTicketSchema, input);
  const base64 = data.image.slice(data.image.indexOf(",") + 1);
  const bytes = Buffer.from(base64, "base64");
  if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) {
    throw new AppError("The trip ticket photo is not valid.");
  }

  const result = await withTransaction(async (conn) => {
    const request = await lockAndLoad(conn, data.id);
    if (!["approved", "dispatched", "completed"].includes(request.status)) {
      throw new AppError("The trip ticket can be sent after final approval.");
    }

    const users = await loadUsers(conn);
    const requester = users.find((u) => u.id === request.requisitionerId);
    if (!requester) throw new AppError("We couldn't find the requisitioner for this request.");

    const existing = await all<RowDataPacket[]>(
      `SELECT id FROM notifications
       WHERE request_id = ? AND to_user_id = ? AND kind = 'approved_requester'
       ORDER BY created_at, id
       FOR UPDATE`,
      [request.id, requester.id],
      conn,
    );
    let notificationId = existing[0]?.["id"] ? String(existing[0]["id"]) : "";
    let alreadySent = false;

    if (existing.length) {
      const notificationIds = existing.map((row) => String(row["id"]));
      const attachments = await all<RowDataPacket[]>(
        "SELECT notification_id, image FROM notification_attachments WHERE notification_id IN (?)",
        [notificationIds],
        conn,
      );
      alreadySent = attachments.length > 0;
      await run(
        `UPDATE notifications
         SET body = ?, read_at = IF(?, read_at, NULL)
         WHERE id = ?`,
        [
          `The official trip ticket for ${request.number} is attached. It was prepared by ${viewer.name}.`,
          alreadySent,
          notificationId,
        ],
        conn,
      );
      const duplicateIds = notificationIds.slice(1);
      if (duplicateIds.length) {
        await run("DELETE FROM notifications WHERE id IN (?)", [duplicateIds], conn);
      }
    } else {
      const ctx = { users, now: new Date().toISOString(), newId: () => randomUUID() };
      const emails = makeEmails(
        ctx,
        request,
        "approved_requester",
        [requester],
        `The official trip ticket for ${request.number} is attached. It was prepared by ${viewer.name}.`,
      );
      await insertNotifications(conn, emails);
      notificationId = emails[0]?.id ?? "";
      if (!notificationId) throw new AppError("We couldn't prepare the trip ticket notification.");
    }

    await run(
      `INSERT INTO notification_attachments (notification_id, mime, image)
       VALUES (?, 'image/png', ?)
       ON DUPLICATE KEY UPDATE image = VALUES(image)`,
      [notificationId, bytes],
      conn,
    );
    await run(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE request_id = ? AND kind = 'trip_ticket_reminder'`,
      [request.id],
      conn,
    );
    return { alreadySent, request, ticketImage: bytes };
  });
  const testEmail = await sendTripTicketTestEmail(result.request, result.ticketImage, viewer.name);
  return { alreadySent: result.alreadySent, ...(testEmail ? { testEmail } : {}) };
}

/* ------------------------------ Vehicles ----------------------------- */

export async function listVehicles(): Promise<{
  vehicles: Vehicle[];
  reservations: VehicleReservation[];
}> {
  const viewer = await requireViewer();
  if (!canManageVehicles(viewer.role)) {
    throw new AppError("Vehicle records are managed by Transport Services.");
  }
  const pool = await getPool();
  const [vehicles, rows] = await Promise.all([
    loadVehicles(pool),
    all<RowDataPacket[]>(
      `SELECT vehicle_id, number, date_start, date_end FROM requests
       WHERE vehicle_id IS NOT NULL AND status NOT IN ('returned','completed')
       ORDER BY date_start`,
      [],
    ),
  ]);
  return {
    vehicles,
    reservations: rows.map((row) => ({
      vehicleId: String(row["vehicle_id"]),
      number: String(row["number"]),
      dateStart: String(row["date_start"]),
      dateEnd: String(row["date_end"]),
    })),
  };
}

export async function addVehicle(input: unknown): Promise<Vehicle> {
  const viewer = await requireViewer();
  if (!canManageVehicles(viewer.role)) {
    throw new AppError("Only Transport Services can add vehicles.");
  }
  const data = parseInput(vehicleSchema, input);
  const id = randomUUID();
  try {
    await run(
      `INSERT INTO vehicles (id, type, plate_no, capacity, status)
       VALUES (?, ?, ?, ?, 'in_service')`,
      [id, data.type, data.plateNo, data.capacity],
    );
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError("A vehicle with that plate number already exists.", {
        plateNo: "This plate number is already recorded.",
      });
    }
    throw error;
  }
  return {
    id,
    type: data.type,
    plateNo: data.plateNo,
    capacity: data.capacity,
    status: "in_service",
  };
}

/* ------------------------------- Stats ------------------------------- */

export async function dashboardStats(): Promise<DashboardStats> {
  const viewer = await requireViewer();
  const scoped = !canViewAllRequests(viewer.role);
  const where = scoped ? "WHERE requisitioner_id = ?" : "";
  const params = scoped ? [viewer.id] : [];

  const counts = await all<RowDataPacket[]>(
    `SELECT status, COUNT(*) AS n FROM requests ${where} GROUP BY status`,
    params,
  );
  const byStatus = new Map<string, number>();
  for (const row of counts) byStatus.set(String(row["status"]), Number(row["n"]));

  const monthRows = await all<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM requests
     ${scoped ? `${where} AND` : "WHERE"} YEAR(submitted_at) = YEAR(NOW()) AND MONTH(submitted_at) = MONTH(NOW())`,
    params,
  );

  let awaitingYou = 0;
  if (viewer.role === "requisitioner") {
    awaitingYou =
      (byStatus.get("pending_review") ?? 0) +
      (byStatus.get("pending_recommendation") ?? 0) +
      (byStatus.get("pending_approval") ?? 0);
  } else if (isApproverRole(viewer.role)) {
    const stageRoleStatus: Record<string, Status> = {
      transport_head: "pending_review",
      director: "pending_recommendation",
      president: "pending_approval",
    };
    const status = stageRoleStatus[viewer.role];
    if (status) {
      const rows = await all<RowDataPacket[]>(
        "SELECT COUNT(*) AS n FROM requests WHERE status = ?",
        [status],
      );
      awaitingYou = Number(rows[0]?.["n"] ?? 0);
    }
  }

  const approved =
    (byStatus.get("approved") ?? 0) +
    (byStatus.get("dispatched") ?? 0) +
    (byStatus.get("completed") ?? 0);

  let pageViews30d: number | null = null;
  if (viewer.role === "admin") {
    const rows = await all<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM analytics_pageviews WHERE viewed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
    );
    pageViews30d = Number(rows[0]?.["n"] ?? 0);
  }

  const total = [...byStatus.values()].reduce((sum, n) => sum + n, 0);

  return {
    total,
    pending:
      (byStatus.get("pending_review") ?? 0) +
      (byStatus.get("pending_recommendation") ?? 0) +
      (byStatus.get("pending_approval") ?? 0),
    returned: byStatus.get("returned") ?? 0,
    approved,
    completed: byStatus.get("completed") ?? 0,
    awaitingYou,
    thisMonth: Number(monthRows[0]?.["n"] ?? 0),
    pageViews30d,
  };
}
