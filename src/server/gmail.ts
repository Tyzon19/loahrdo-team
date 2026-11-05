import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

const LOGO_CONTENT_ID = "loa-header-logo";

export type EmailDeliveryResult =
  | {
      sent: true;
      delivered: number;
      failed: 0;
      recipientResults?: EmailRecipientResult[] | undefined;
    }
  | {
      sent: false;
      delivered: number;
      failed: number;
      message: string;
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
  logo: Buffer,
  ticketImage?: Buffer,
  ticketFilename?: string,
  attachments: EmailAttachment[] = [],
): string {
  const relatedBoundary = `loa_related_${randomBytes(18).toString("hex")}`;
  const alternativeBoundary = `loa_alt_${randomBytes(18).toString("hex")}`;
  const ticketContentId = ticketImage ? "approved-trip-ticket" : undefined;

  if (!attachments.length) {
    const parts = [
      `To: ${recipient}`,
      `Subject: ${encodedHeader(subject)}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
      "",
      `--${relatedBoundary}`,
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
      `--${relatedBoundary}`,
      'Content-Type: image/png; name="loa-loading.png"',
      "Content-Transfer-Encoding: base64",
      `Content-ID: <${LOGO_CONTENT_ID}>`,
      'Content-Disposition: inline; filename="loa-loading.png"',
      "",
      base64(logo),
    ];

    if (ticketImage && ticketFilename && ticketContentId) {
      parts.push(
        `--${relatedBoundary}`,
        `Content-Type: image/png; name="${ticketFilename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-ID: <${ticketContentId}>`,
        `Content-Disposition: inline; filename="${ticketFilename}"`,
        "",
        base64(ticketImage),
      );
    }

    parts.push(`--${relatedBoundary}--`, "");
    return parts.join("\r\n");
  }

  const mixedBoundary = `loa_mixed_${randomBytes(18).toString("hex")}`;
  const parts = [
    `To: ${recipient}`,
    `Subject: ${encodedHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    `--${mixedBoundary}`,
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

  for (const attachment of attachments) {
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: ${attachment.mime}; name="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "",
      base64(attachment.content),
    );
  }

  parts.push(`--${mixedBoundary}--`, "");
  return parts.join("\r\n");
}

async function sendMimeMessage(token: string, mime: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64Url(mime) }),
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
}

async function createNotificationMime(
  message: EmailMessage,
  request: VehicleRequest,
  siteUrl: URL,
  logo: Buffer,
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
    LOGO_CONTENT_ID,
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
    logo,
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
  let logo: Buffer;
  try {
    token = await accessToken();
    siteUrl = siteUrlForEmail();
    logo = await readFile(join(process.cwd(), "public", "loa-loading.png"));
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
      const mime = await createNotificationMime(message, request, siteUrl, logo, ticketImage);
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
    const subject = input.copyType === "soft" ? "Your COE is ready" : "Your COE request has been approved";
    const text = [
      `Dear ${input.recipientName},`,
      "",
      `Your COE request (${input.requestId}) has been approved by HRDO.`,
      input.copyType === "soft"
        ? "A signed copy is attached below for your records."
        : "The approved COE has been prepared and is ready for collection or release.",
      "",
      `View the portal: ${new URL(`/hrdo/coe/${encodeURIComponent(input.requestId)}`, siteUrl.origin).toString()}`,
      "",
      "Thank you,",
      "Lyceum of Alabang HRDO",
    ].join("\n");
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <p>Dear ${input.recipientName},</p>
        <p>Your COE request (<strong>${input.requestId}</strong>) has been approved by HRDO.</p>
        <p>${
          input.copyType === "soft"
            ? "A signed copy is attached below for your records."
            : "The approved COE has been prepared and is ready for collection or release."
        }</p>
        <p><a href="${new URL(`/hrdo/coe/${encodeURIComponent(input.requestId)}`, siteUrl.origin).toString()}">Open your COE request</a></p>
        <p>Thank you,<br/>Lyceum of Alabang HRDO</p>
      </div>
    `;

    const token = await accessToken();
    const logo = await readFile(join(process.cwd(), "public", "loa-loading.png"));
    const mime = createMimeMessage(
      input.recipientEmail,
      subject,
      text,
      html,
      logo,
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
    const subject = input.subject || subjectMap[input.status];
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
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <p>Dear ${input.recipientName},</p>
        <p><strong>Update for your COE request (${input.requestId})</strong></p>
        <p>${input.title}</p>
        <p>${input.message.replace(/\n/g, "<br />")}</p>
        <p><a href="${new URL(`/hrdo/coe/${encodeURIComponent(input.requestId)}`, siteUrl.origin).toString()}">Open your COE request</a></p>
        <p>Thank you,<br/>Lyceum of Alabang HRDO</p>
      </div>
    `;

    const token = await accessToken();
    const logo = await readFile(join(process.cwd(), "public", "loa-loading.png"));
    const mime = createMimeMessage(
      input.recipientEmail,
      subject,
      text,
      html,
      logo,
      undefined,
      undefined,
      input.attachment ? [input.attachment] : [],
    );
    await sendMimeMessage(token, mime);
    return { sent: true, delivered: 1, failed: 0 };
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
        <p>Dear ${input.recipientName || "HRDO Processor"},</p>
        <p>A new Certificate of Employment request is waiting for HRDO processing.</p>
        <p>
          <strong>Requester:</strong> ${input.requesterName}<br />
          <strong>Requester email:</strong> ${input.requesterEmail}<br />
          <strong>Department:</strong> ${input.department}<br />
          <strong>Purpose:</strong> ${input.purpose}<br />
          <strong>Request ID:</strong> ${input.requestId}
        </p>
        <p><a href="${requestUrl}">Review the COE request</a></p>
        <p>Thank you,<br />LOA HRDO DESK TEAM</p>
      </div>
    `;

    const token = await accessToken();
    const logo = await readFile(join(process.cwd(), "public", "loa-loading.png"));
    const mime = createMimeMessage(input.recipientEmail, subject, text, html, logo);
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
        loginUrl: new URL("/login", siteUrl.origin).toString(),
        ...(input.accountAction ? { accountAction: input.accountAction } : {}),
      },
      LOGO_CONTENT_ID,
    );
    const [token, logo] = await Promise.all([
      accessToken(),
      readFile(join(process.cwd(), "public", "loa-loading.png")),
    ]);
    const mime = createMimeMessage(
      input.recipientEmail,
      rendered.subject,
      rendered.text,
      rendered.html,
      logo,
    );
    await sendMimeMessage(token, mime);
    return { sent: true, delivered: 1, failed: 0 };
  } catch (error) {
    console.error(
      `[email] Signatory account email failed: ${
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
  const token = await accessToken();
  const email = renderRegistrationOtpEmail(
    { recipientName, code, expiresInMinutes },
    LOGO_CONTENT_ID,
  );
  let logo: Buffer;
  try {
    logo = await readFile(join(process.cwd(), "public", "loa-loading.png"));
  } catch (error) {
    console.error(
      `[gmail] Could not read the email logo: ${error instanceof Error ? error.name : "unknown"}`,
    );
    throw new AppError("We couldn't prepare the verification email. Please try again later.");
  }
  const mime = createMimeMessage(recipient, email.subject, email.text, email.html, logo);
  await sendMimeMessage(token, mime);
}
