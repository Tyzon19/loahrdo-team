import { randomBytes } from "node:crypto";
import {
  renderEmailTemplate,
  renderRegistrationOtpEmail,
  renderTemporaryPasswordEmail,
} from "@/lib/email-template";
import { AppError } from "@/lib/errors";
import type { EmailMessage, VehicleRequest } from "@/lib/types";
import { STAGES } from "@/lib/workflow";
import { publicSiteUrl, serverEnvOptional } from "./env";

interface GoogleTokenResponse {
  access_token?: string;
}

export type EmailDeliveryResult =
  | {
      sent: true;
      delivered: number;
      failed: 0;
      threadId?: string;
      recipientResults?: EmailRecipientResult[] | undefined;
    }
  | {
      sent: false;
      delivered: number;
      failed: number;
      message: string;
      threadId?: string;
      recipientResults?: EmailRecipientResult[] | undefined;
    };

export interface EmailAttachment {
  filename: string;
  mime: string;
  content: Buffer;
}

export interface EmailRecipientResult {
  notificationId: string;
  sent: boolean;
  message?: string | undefined;
}

interface EmailThreadHeaders {
  messageId: string;
  inReplyTo?: string;
  references?: string;
}

interface SentMessageResult {
  id?: string;
  threadId?: string;
}

function base64(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/.{1,76}/g, "$&\r\n")
    .trimEnd();
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function encodedHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function validEmail(value: string): boolean {
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value) && !/[\r\n]/.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function siteUrlForEmail(): URL {
  let url: URL;
  try {
    url = new URL(publicSiteUrl());
  } catch {
    throw new AppError(
      "Email links are not configured correctly. Contact the system administrator.",
    );
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new AppError(
      "Email links are not configured correctly. Contact the system administrator.",
    );
  }
  if (
    process.env["NODE_ENV"] === "production" &&
    (url.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(url.hostname))
  ) {
    throw new AppError("Production email requires a public HTTPS SITE_URL.");
  }
  return url;
}

async function accessToken(): Promise<string> {
  const clientId = serverEnvOptional("GOOGLE_CLIENT_ID");
  const clientSecret = serverEnvOptional("GOOGLE_CLIENT_SECRET");
  const refreshToken = serverEnvOptional("GOOGLE_REFRESH_TOKEN");
  const senderEmail = serverEnvOptional("GOOGLE_SENDER_EMAIL")?.toLowerCase();
  if (!clientId || !clientSecret || !refreshToken || !senderEmail) {
    const missingSettings = [
      !clientId ? "GOOGLE_CLIENT_ID" : undefined,
      !clientSecret ? "GOOGLE_CLIENT_SECRET" : undefined,
      !refreshToken ? "GOOGLE_REFRESH_TOKEN" : undefined,
      !senderEmail ? "GOOGLE_SENDER_EMAIL" : undefined,
    ].filter((setting): setting is string => Boolean(setting));
    throw new AppError(`Missing Gmail sender configuration: ${missingSettings.join(", ")}.`);
  }
  if (!validEmail(senderEmail)) {
    throw new AppError("GOOGLE_SENDER_EMAIL must be a valid email address.");
  }

  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error(
      `[gmail] OAuth refresh request failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
    throw new AppError("Gmail could not be reached. Please try again later.");
  }

  if (!response.ok) {
    console.error(`[gmail] OAuth refresh failed (${response.status}).`);
    throw new AppError("The Gmail sender authorization is invalid or expired. Reconnect Gmail.");
  }
  const token = (await response.json()) as GoogleTokenResponse;
  if (!token.access_token) {
    console.error("[gmail] OAuth refresh response did not include an access token.");
    throw new AppError("Gmail did not authorize the sender. Reconnect Gmail.");
  }

  return token.access_token;
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function createMimeMessage(
  recipient: string,
  subject: string,
  text: string,
  html: string,
  ticketImage?: Buffer,
  ticketFilename?: string,
  attachments: EmailAttachment[] = [],
  thread?: EmailThreadHeaders,
): string {
  const relatedBoundary = `loa_related_${randomBytes(18).toString("hex")}`;
  const alternativeBoundary = `loa_alt_${randomBytes(18).toString("hex")}`;
  const ticketContentId = ticketImage ? "approved-trip-ticket" : undefined;
  const threadHeaders = thread
    ? [
        `Message-ID: <${thread.messageId}>`,
        ...(thread.inReplyTo ? [`In-Reply-To: <${thread.inReplyTo}>`] : []),
        ...(thread.references ? [`References: <${thread.references}>`] : []),
      ]
    : [];
  const headers = [
    `To: ${recipient}`,
    `Subject: ${encodedHeader(subject)}`,
    "MIME-Version: 1.0",
    ...threadHeaders,
  ];
  const alternativeParts = [
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64(text),
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64(html),
    `--${alternativeBoundary}--`,
  ];
  const relatedParts = [
    `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
    "",
    `--${relatedBoundary}`,
    ...alternativeParts,
  ];
  if (ticketImage && ticketFilename && ticketContentId) {
    relatedParts.push(
      `--${relatedBoundary}`,
      `Content-Type: image/png; name="${ticketFilename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-ID: <${ticketContentId}>`,
      `Content-Disposition: inline; filename="${ticketFilename}"`,
      "",
      base64(ticketImage),
    );
  }
  const bodyParts = ticketImage && ticketFilename && ticketContentId
    ? [...relatedParts, `--${relatedBoundary}--`]
    : alternativeParts;

  if (!attachments.length) {
    return [...headers, ...bodyParts, ""].join("\r\n");
  }

  const mixedBoundary = `loa_mixed_${randomBytes(18).toString("hex")}`;
  const parts = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    `--${mixedBoundary}`,
    ...bodyParts,
    "",
  ];

  for (const attachment of attachments) {
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: ${attachment.mime}; name="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "",
      base64(attachment.content),
      "",
    );
  }

  parts.push(`--${mixedBoundary}--`, "");
  return parts.join("\r\n");
}

async function sendMimeMessage(
  token: string,
  mime: string,
  threadId?: string,
): Promise<SentMessageResult> {
  let response: Response;
  try {
    response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: base64Url(mime),
        ...(threadId ? { threadId } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error(
      `[gmail] Send request failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
    throw new AppError("Gmail could not be reached. Please try again later.");
  }
  if (!response.ok) {
    console.error(`[gmail] Message send failed (${response.status}).`);
    if (response.status === 401 || response.status === 403) {
      throw new AppError(
        "Gmail authorization cannot send messages. Reconnect the approved account at /api/gmail/connect and grant Gmail send permission.",
      );
    }
    throw new AppError("Gmail rejected the message. Check the sender authorization and recipient.");
  }
  return (await response.json()) as SentMessageResult;
}

async function createNotificationMime(
  message: EmailMessage,
  request: VehicleRequest,
  siteUrl: URL,
  ticketImage?: Buffer,
): Promise<string> {
  if (!validEmail(message.toEmail)) {
    throw new AppError("A configured email recipient is invalid.");
  }
  const stage = message.stage ? STAGES.find((item) => item.key === message.stage) : undefined;
  const ticketContentId = ticketImage ? "approved-trip-ticket" : undefined;
  const rendered = renderEmailTemplate(
    message,
    siteUrl.origin,
    ticketImage
      ? `/print/${encodeURIComponent(request.id)}`
      : `/requests/${encodeURIComponent(request.id)}`,
    ticketContentId,
    {
      department: request.department,
      purpose: request.purpose,
      destinations: request.destinations,
      passengers: request.passengers,
      dateStart: dateLabel(request.dateStart),
      dateEnd: dateLabel(request.dateEnd),
      ...(stage ? { currentStage: `${stage.label} — ${stage.title}` } : {}),
    },
  );
  return createMimeMessage(
    message.toEmail,
    rendered.subject,
    rendered.text,
    rendered.html,
    ticketImage,
    ticketImage ? `${request.number}-trip-ticket.png` : undefined,
  );
}

async function deliverNotifications(
  messages: EmailMessage[],
  request: VehicleRequest,
  ticketImage?: Buffer,
): Promise<EmailDeliveryResult> {
  let token: string;
  let siteUrl: URL;
  try {
    token = await accessToken();
    siteUrl = siteUrlForEmail();
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "Email could not be prepared. Contact the system administrator.";
    console.error(
      `[email] Preparation failed: ${
        error instanceof AppError ? error.message : error instanceof Error ? error.name : "unknown"
      }`,
    );
    return {
      sent: false,
      delivered: 0,
      failed: messages.length,
      message: `The request was saved, but ${message}`,
      recipientResults: messages.map(({ id }) => ({
        notificationId: id,
        sent: false,
        message,
      })),
    };
  }

  let delivered = 0;
  let firstDeliveryError: string | undefined;
  const recipientResults: EmailRecipientResult[] = [];
  for (const message of messages) {
    try {
      const mime = await createNotificationMime(message, request, siteUrl, ticketImage);
      await sendMimeMessage(token, mime);
      delivered += 1;
      recipientResults.push({ notificationId: message.id, sent: true });
    } catch (error) {
      const deliveryMessage =
        error instanceof AppError
          ? error.message
          : "Email delivery failed. Contact the system administrator.";
      firstDeliveryError ??= deliveryMessage;
      recipientResults.push({
        notificationId: message.id,
        sent: false,
        message: deliveryMessage,
      });
      console.error(
        `[email] Notification delivery failed: ${
          error instanceof AppError
            ? error.message
            : error instanceof Error
              ? error.name
              : "unknown"
        }`,
      );
    }
  }

  const failed = messages.length - delivered;
  return failed
    ? {
        sent: false,
        delivered,
        failed,
        message: `The request was saved, but email delivery failed for ${failed} of ${messages.length} configured recipient(s). ${firstDeliveryError ?? "In-app notifications are still available."}`,
        recipientResults,
      }
    : { sent: true, delivered, failed: 0, recipientResults };
}

export function sendWorkflowEmails(
  messages: EmailMessage[],
  request: VehicleRequest,
): Promise<EmailDeliveryResult> {
  return deliverNotifications(messages, request);
}

export function sendTripTicketEmail(
  message: EmailMessage,
  request: VehicleRequest,
  ticketImage: Buffer,
): Promise<EmailDeliveryResult> {
  return deliverNotifications([message], request, ticketImage);
}

export async function sendCoeReleaseEmail(input: {
  recipientName: string;
  recipientEmail: string;
  requestId: string;
  employeeName: string;
  copyType: "soft" | "original" | "both";
  attachment?: EmailAttachment;
}): Promise<EmailDeliveryResult> {
  try {
    if (!validEmail(input.recipientEmail)) {
      throw new AppError("The COE recipient email address is invalid.");
    }

    const siteUrl = siteUrlForEmail();
    const subject =
      input.copyType === "soft"
        ? "Your COE is ready"
        : input.copyType === "both"
          ? "Your COE soft copy is ready; hardcopy available for pickup"
          : "Your COE hardcopy is ready for pickup";
    const deliveryMessage =
      input.copyType === "soft"
        ? "A signed copy is attached below for your records."
        : input.copyType === "both"
          ? "Your signed soft copy is attached. Your printed hardcopy is also ready for pickup at the HRDO office."
          : "Your printed, signed hardcopy is ready for pickup at the HRDO office.";
    const recipientNameHtml = escapeHtml(input.recipientName);
    const requestIdHtml = escapeHtml(input.requestId);
    const text = [
      `Dear ${input.recipientName},`,
      "",
      `Your COE request (${input.requestId}) has been approved by HRDO.`,
      deliveryMessage,
      "",
      `View the portal: ${new URL(`/hrdo/coe/${encodeURIComponent(input.requestId)}`, siteUrl.origin).toString()}`,
      "",
      "Thank you,",
      "Lyceum of Alabang HRDO",
      "",
      "For any concern, please message us on Facebook:",
      "https://www.facebook.com/lyceumhrdo",
    ].join("\n");
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <p>Dear ${recipientNameHtml},</p>
        <p>Your COE request (<strong>${requestIdHtml}</strong>) has been approved by HRDO.</p>
        <p>${deliveryMessage}</p>
        <p><a href="${new URL(`/hrdo/coe/${encodeURIComponent(input.requestId)}`, siteUrl.origin).toString()}">Open your COE request</a></p>
        <p>Thank you,<br/>Lyceum of Alabang HRDO</p>
        <p>For any concern, please message us on Facebook: <a href="https://www.facebook.com/lyceumhrdo">https://www.facebook.com/lyceumhrdo</a></p>
      </div>
    `;

    const token = await accessToken();
    const mime = createMimeMessage(
      input.recipientEmail,
      subject,
      text,
      html,
      undefined,
      undefined,
      input.attachment ? [input.attachment] : [],
    );
    await sendMimeMessage(token, mime);
    return { sent: true, delivered: 1, failed: 0 };
  } catch (error) {
    console.error(
      `[email] COE release email failed: ${error instanceof AppError ? error.message : error instanceof Error ? error.name : "unknown"}`,
    );
    return {
      sent: false,
      delivered: 0,
      failed: 1,
      message:
        error instanceof AppError
          ? error.message
          : "The COE was approved, but its email could not be prepared.",
    };
  }
}

export async function sendCoeStatusEmail(input: {
  recipientName: string;
  recipientEmail: string;
  requestId: string;
  status:
    | "pending"
    | "under_review"
    | "correction_requested"
    | "rejected"
    | "processing"
    | "awaiting_review"
    | "ready_for_pickup"
    | "released";
  title: string;
  message: string;
  attachment?: EmailAttachment;
  subject?: string;
  threadId?: string;
}): Promise<EmailDeliveryResult> {
  try {
    if (!validEmail(input.recipientEmail)) {
      throw new AppError("The COE status recipient email address is invalid.");
    }

    const siteUrl = siteUrlForEmail();
    const subjectMap: Record<typeof input.status, string> = {
      pending: "Your COE request is pending",
      under_review: "Your COE request is under review",
      correction_requested: "Action needed for your COE request",
      rejected: "Your COE request was not approved",
      processing: "Your COE request is being processed",
      awaiting_review: "Your filled COE template is ready for review",
      ready_for_pickup: "Your COE is ready for pickup",
      released: "Your COE has been released",
    };
    const rootMessageId = `coe-${input.requestId}@loa.local`;
    const subject = input.subject || subjectMap[input.status];
    const thread =
      input.status === "under_review"
        ? { messageId: rootMessageId }
        : {
            messageId: `coe-${input.requestId}-${randomBytes(8).toString("hex")}@loa.local`,
            inReplyTo: rootMessageId,
            references: rootMessageId,
          };
    const recipientNameHtml = escapeHtml(input.recipientName);
    const requestIdHtml = escapeHtml(input.requestId);
    const titleHtml = escapeHtml(input.title);
    const text = [
      `Dear ${input.recipientName},`,
      "",
      `Update for your COE request (${input.requestId}):`,
      "",
      input.title,
      "",
      input.message,
      "",
      `View your request: ${new URL(`/hrdo/coe/${encodeURIComponent(input.requestId)}`, siteUrl.origin).toString()}`,
      "",
      "Thank you,",
      "Lyceum of Alabang HRDO",
    ].join("\n");
    const safeMessage = escapeHtml(input.message).replace(/\r?\n/g, "<br />");
    const messageHtml =
      input.status === "rejected"
        ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:5px;background-color:#fef2f2;"><tr><td style="padding:14px 16px;color:#991b1b;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;"><strong style="display:block;margin-bottom:4px;color:#b91c1c;font-size:13px;">Reason for rejection</strong><span>${safeMessage}</span></td></tr></table>`
        : `<p>${safeMessage}</p>`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <p>Dear ${recipientNameHtml},</p>
        <p><strong>Update for your COE request (${requestIdHtml})</strong></p>
        <p>${titleHtml}</p>
        ${messageHtml}
        <p><a href="${new URL(`/hrdo/coe/${encodeURIComponent(input.requestId)}`, siteUrl.origin).toString()}">Open your COE request</a></p>
        <p>Thank you,<br/>Lyceum of Alabang HRDO</p>
        <p>For any concern, please message us on Facebook: <a href="https://www.facebook.com/lyceumhrdo">https://www.facebook.com/lyceumhrdo</a></p>
        <p style="margin:20px 0 0;color:#ff3333;font-size:13px;font-weight:700;line-height:1.6;">This is an automated notification. Please do not reply to this email.</p>
      </div>
    `;

    const token = await accessToken();
    const mime = createMimeMessage(
      input.recipientEmail,
      subject,
      text,
      html,
      undefined,
      undefined,
      input.attachment ? [input.attachment] : [],
      thread,
    );
    const sentMessage = await sendMimeMessage(token, mime, input.threadId);
    return {
      sent: true,
      delivered: 1,
      failed: 0,
      ...(sentMessage.threadId ? { threadId: sentMessage.threadId } : {}),
    };
  } catch (error) {
    console.error(
      `[email] COE status email failed: ${error instanceof AppError ? error.message : error instanceof Error ? error.name : "unknown"}`,
    );
    return {
      sent: false,
      delivered: 0,
      failed: 1,
      message:
        error instanceof AppError
          ? error.message
          : "The COE status update could not be emailed to the requestor.",
    };
  }
}

export async function sendCoeProcessorNotification(input: {
  recipientName: string;
  recipientEmail: string;
  requestId: string;
  requesterName: string;
  requesterEmail: string;
  department: string;
  purpose: string;
}): Promise<EmailDeliveryResult> {
  try {
    if (!validEmail(input.recipientEmail)) {
      throw new AppError("The COE processor email address is invalid.");
    }

    const siteUrl = siteUrlForEmail();
    const requestUrl = new URL(
      `/hrdo/coe/${encodeURIComponent(input.requestId)}`,
      siteUrl.origin,
    ).toString();
    const recipientNameHtml = escapeHtml(input.recipientName || "HRDO Processor");
    const requesterNameHtml = escapeHtml(input.requesterName);
    const requesterEmailHtml = escapeHtml(input.requesterEmail);
    const departmentHtml = escapeHtml(input.department);
    const purposeHtml = escapeHtml(input.purpose);
    const requestIdHtml = escapeHtml(input.requestId);
    const subject = `New COE request from ${input.requesterName}`;
    const text = [
      `Dear ${input.recipientName || "HRDO Processor"},`,
      "",
      "A new Certificate of Employment request is waiting for HRDO processing.",
      "",
      `Requester: ${input.requesterName}`,
      `Requester email: ${input.requesterEmail}`,
      `Department: ${input.department}`,
      `Purpose: ${input.purpose}`,
      `Request ID: ${input.requestId}`,
      "",
      `Review the request: ${requestUrl}`,
      "",
      "Thank you,",
      "LOA HRDO DESK TEAM",
    ].join("\n");
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <p>Dear ${recipientNameHtml},</p>
        <p>A new Certificate of Employment request is waiting for HRDO processing.</p>
        <p>
          <strong>Requester:</strong> ${requesterNameHtml}<br />
          <strong>Requester email:</strong> ${requesterEmailHtml}<br />
          <strong>Department:</strong> ${departmentHtml}<br />
          <strong>Purpose:</strong> ${purposeHtml}<br />
          <strong>Request ID:</strong> ${requestIdHtml}
        </p>
        <p><a href="${requestUrl}">Review the COE request</a></p>
        <p>Thank you,<br />LOA HRDO DESK TEAM</p>
      </div>
    `;

    const token = await accessToken();
    const mime = createMimeMessage(input.recipientEmail, subject, text, html);
    await sendMimeMessage(token, mime);
    return { sent: true, delivered: 1, failed: 0 };
  } catch (error) {
    console.error(
      `[email] COE processor notification failed: ${error instanceof AppError ? error.message : error instanceof Error ? error.name : "unknown"}`,
    );
    return {
      sent: false,
      delivered: 0,
      failed: 1,
      message:
        error instanceof AppError
          ? error.message
          : "The COE processor notification could not be prepared.",
    };
  }
}

export async function sendTemporaryPasswordEmail(input: {
  recipientName: string;
  recipientEmail: string;
  temporaryPassword: string;
  signatoryTitle: string;
  accountAction?: "created" | "password-reset";
  loginPath?: "/login" | "/hrdo/login" | "/permission-slips/login";
  systemName?: string;
}): Promise<EmailDeliveryResult> {
  try {
    if (!validEmail(input.recipientEmail)) {
      throw new AppError("The signatory email address is invalid.");
    }
    const siteUrl = siteUrlForEmail();
    const rendered = renderTemporaryPasswordEmail(
      {
        recipientName: input.recipientName,
        email: input.recipientEmail,
        temporaryPassword: input.temporaryPassword,
        signatoryTitle: input.signatoryTitle,
        loginUrl: new URL(input.loginPath ?? "/login", siteUrl.origin).toString(),
        ...(input.systemName ? { systemName: input.systemName } : {}),
        ...(input.accountAction ? { accountAction: input.accountAction } : {}),
      },
      new URL("/hrdo-email-banner.jpg", siteUrl.origin).toString(),
    );
    const token = await accessToken();
    const mime = createMimeMessage(
      input.recipientEmail,
      rendered.subject,
      rendered.text,
      rendered.html,
    );
    await sendMimeMessage(token, mime);
    return { sent: true, delivered: 1, failed: 0 };
  } catch (error) {
    console.error(
      `[email] Temporary account email failed: ${
        error instanceof AppError ? error.message : error instanceof Error ? error.name : "unknown"
      }`,
    );
    return {
      sent: false,
      delivered: 0,
      failed: 1,
      message:
        error instanceof AppError
          ? error.message
          : "The signatory account was created, but its email could not be prepared.",
    };
  }
}

export async function sendRegistrationOtpEmail(
  recipient: string,
  recipientName: string,
  code: string,
  expiresInMinutes: number,
): Promise<void> {
  if (!validEmail(recipient)) {
    throw new AppError("The verification email recipient is invalid.");
  }
  const siteUrl = siteUrlForEmail();
  const token = await accessToken();
  const email = renderRegistrationOtpEmail(
    { recipientName, code, expiresInMinutes },
    new URL("/hrdo-email-banner.jpg", siteUrl.origin).toString(),
  );
  const mime = createMimeMessage(recipient, email.subject, email.text, email.html);
  await sendMimeMessage(token, mime);
}

export async function sendLeaveEmail(recipient: string, subject: string, message: string) {
  if (!validEmail(recipient)) throw new AppError("Invalid leave notification recipient.");
  const url = new URL("/leaves/requests", siteUrlForEmail().origin).toString();
  const text = `${message}\n\nReview your leave application: ${url}\n\nLyceum of Alabang — Human Resource Development Office`;
  await sendMimeMessage(
    await accessToken(),
    createMimeMessage(
      recipient,
      subject,
      text,
      `<!doctype html><html lang="en"><body style="margin:0;background:#f3f5f8;padding:32px 12px;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="600" style="width:100%;max-width:600px;background:#fff;border:1px solid #e2e7ef;border-radius:8px;overflow:hidden"><tr><td><img src="${escapeHtml(new URL("/hrdo-email-banner.jpg", siteUrlForEmail().origin).toString())}" width="600" alt="Lyceum of Alabang Human Resource Development Office" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr><tr><td style="padding:28px 32px"><h1 style="margin:0 0 14px;color:#1f3b68;font-size:22px">${escapeHtml(subject)}</h1><p style="font-size:14px;line-height:1.65">${escapeHtml(message)}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;background:#1f3b68;border-radius:5px;color:#fff;text-decoration:none;font-weight:700">Open Leave &amp; Attendance</a></p></td></tr><tr><td style="padding:0 32px 26px;color:#687386;font-size:11px;font-style:italic;line-height:1.55"><strong style="display:block;margin-bottom:8px;color:#353b45;font-style:normal">Lyceum of Alabang — Human Resource Development Office</strong>This message contains privileged and confidential information and is intended only for the individual named. If you received this communication by error, please contact the sender immediately and delete the material from any computer. The above terms reflect a potential business arrangement, and are provided solely as a basis for further discussion, and are not intended to be and do not constitute a legally binding obligation.</td></tr></table></td></tr></table></body></html>`,
    ),
  );
}

export async function sendPermissionSlipEmail(input: {
  kind: "head_review" | "employee_approved" | "employee_rejected";
  recipientName: string;
  recipientEmail: string;
  permissionId: string;
  employeeName: string;
  department: string;
  requestedDate: string;
  timeOut: string;
  timeIn: string;
  reason: string;
  rejectionReason?: string;
  attachment?: EmailAttachment;
}): Promise<EmailDeliveryResult> {
  try {
    if (!validEmail(input.recipientEmail)) {
      throw new AppError("The permission slip recipient email address is invalid.");
    }
    const token = await accessToken();
    const siteUrl = siteUrlForEmail();
    const actionPath = `/permission-slips/${encodeURIComponent(input.permissionId)}`;
    const actionUrl = new URL(actionPath, siteUrl.origin).toString();
    const subject =
      input.kind === "head_review"
        ? "Permission Slip — HRDO approval required"
        : input.kind === "employee_approved"
          ? "Your Permission Slip has been approved"
          : "Your Permission Slip was rejected";
    const message =
      input.kind === "head_review"
        ? `A Permission Slip from ${input.employeeName} is waiting for your review and signature.`
        : input.kind === "employee_approved"
          ? "Your Permission Slip has been approved by an assigned HRDO signatory. The softcopy is attached."
          : `Your Permission Slip was rejected. Reason: ${input.rejectionReason ?? "Please review the request."}`;
    const safe = {
      recipientName: escapeHtml(input.recipientName),
      employeeName: escapeHtml(input.employeeName),
      department: escapeHtml(input.department),
      requestedDate: escapeHtml(input.requestedDate),
      timeOut: escapeHtml(input.timeOut),
      timeIn: escapeHtml(input.timeIn),
      reason: escapeHtml(input.reason),
      message: escapeHtml(message),
      actionUrl: escapeHtml(actionUrl),
      logoUrl: escapeHtml(new URL("/hrdo-email-banner.jpg", siteUrl.origin).toString()),
    };
    const text = [
      `Dear ${input.recipientName},`,
      "",
      message,
      "",
      `Employee: ${input.employeeName}`,
      `Department: ${input.department}`,
      `Date: ${input.requestedDate}`,
      `Time Out: ${input.timeOut}`,
      `Time In: ${input.timeIn}`,
      `Reason: ${input.reason}`,
      "",
      `Open the Permission Slip: ${actionUrl}`,
      "",
      "Lyceum of Alabang Human Resource Development Office",
    ].join("\n");
    const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f3f5f8;padding:32px 12px;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="600" style="width:100%;max-width:600px;background:#fff;border:1px solid #e2e7ef;border-radius:8px"><tr><td style="padding:30px 32px"><img src="${safe.logoUrl}" width="190" alt="Lyceum of Alabang" style="display:block;max-width:100%;height:auto"><h1 style="margin:28px 0 12px;color:#1f3b68;font-size:22px">Permission Slip</h1><p>Dear ${safe.recipientName},</p><p>${safe.message}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:20px 0"><tr><td style="padding:8px;border-bottom:1px solid #e5e9f0;color:#687386">Name</td><td style="padding:8px;border-bottom:1px solid #e5e9f0;font-weight:700">${safe.employeeName}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #e5e9f0;color:#687386">Department</td><td style="padding:8px;border-bottom:1px solid #e5e9f0;font-weight:700">${safe.department}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #e5e9f0;color:#687386">Date</td><td style="padding:8px;border-bottom:1px solid #e5e9f0;font-weight:700">${safe.requestedDate}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #e5e9f0;color:#687386">Time Out</td><td style="padding:8px;border-bottom:1px solid #e5e9f0;font-weight:700">${safe.timeOut}</td><td style="padding:8px;border-bottom:1px solid #e5e9f0;color:#687386">Time In</td><td style="padding:8px;border-bottom:1px solid #e5e9f0;font-weight:700">${safe.timeIn}</td></tr><tr><td style="padding:8px;color:#687386;vertical-align:top">Reason</td><td style="padding:8px;font-weight:700">${safe.reason}</td></tr></table><p><a href="${safe.actionUrl}" style="display:inline-block;background:#1f3b68;color:#fff;padding:13px 22px;border-radius:5px;text-decoration:none;font-weight:700">${input.kind === "head_review" ? "Review Permission Slip" : "View Permission Slip"}</a></p><p style="margin-top:28px;color:#687386;font-size:12px">This is an automated notification from Lyceum of Alabang HRDO.</p></td></tr></table></td></tr></table></body></html>`;
    const mime = createMimeMessage(
      input.recipientEmail,
      subject,
      text,
      html,
      undefined,
      undefined,
      input.attachment ? [input.attachment] : [],
    );
    await sendMimeMessage(token, mime);
    return { sent: true, delivered: 1, failed: 0 };
  } catch (error) {
    console.error(
      `[email] Permission Slip email failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
    return {
      sent: false,
      delivered: 0,
      failed: 1,
      message:
        error instanceof AppError
          ? error.message
          : "The Permission Slip was saved, but its email could not be sent.",
    };
  }
}
