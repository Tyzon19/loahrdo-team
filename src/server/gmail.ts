import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderEmailTemplate, renderRegistrationOtpEmail } from "@/lib/email-template";
import { AppError } from "@/lib/errors";
import type { EmailMessage, VehicleRequest } from "@/lib/types";
import { STAGES } from "@/lib/workflow";
import { publicSiteUrl, serverEnvOptional } from "./env";

interface GoogleTokenResponse {
  access_token?: string;
}

const LOGO_CONTENT_ID = "loa-header-logo";
const WORKFLOW_TEST_RECIPIENT = "mj.turingan@lyceumalabang.edu.ph";
const WORKFLOW_TEST_NAME = "MJ Turingan";

export interface WorkflowTestEmailResult {
  sent: boolean;
  message?: string;
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

async function accessToken(): Promise<string> {
  const clientId = serverEnvOptional("GOOGLE_CLIENT_ID");
  const clientSecret = serverEnvOptional("GOOGLE_CLIENT_SECRET");
  const refreshToken = serverEnvOptional("GOOGLE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new AppError(
      "Email verification is not connected yet. Please contact the system administrator.",
    );
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
    throw new AppError("We couldn't send the verification email. Please try again later.");
  }

  if (!response.ok) {
    console.error(`[gmail] OAuth refresh failed (${response.status}).`);
    throw new AppError("We couldn't send the verification email. Please try again later.");
  }
  const token = (await response.json()) as GoogleTokenResponse;
  if (!token.access_token) {
    console.error("[gmail] OAuth refresh response did not include an access token.");
    throw new AppError("We couldn't send the verification email. Please try again later.");
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

/** Sends workflow-triggered email samples only to the configured local test account. */
export async function sendWorkflowTestEmail(
  source: EmailMessage | undefined,
  request: VehicleRequest,
): Promise<WorkflowTestEmailResult | undefined> {
  if (process.env["NODE_ENV"] === "production") return undefined;

  let siteUrl: URL;
  try {
    siteUrl = new URL(publicSiteUrl());
  } catch (error) {
    console.error(
      `[gmail-test] Invalid local SITE_URL: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return { sent: false, message: "SITE_URL must be a valid URL for local email testing." };
  }
  if (!["localhost", "127.0.0.1"].includes(siteUrl.hostname)) return undefined;
  if (!source) {
    return { sent: false, message: "No signatory account is configured for this approval stage." };
  }

  const recipient = serverEnvOptional("GOOGLE_TEST_RECIPIENT")?.toLowerCase();
  if (!recipient) {
    return { sent: false, message: "Configure GOOGLE_TEST_RECIPIENT for local email testing." };
  }
  if (recipient !== WORKFLOW_TEST_RECIPIENT) {
    return {
      sent: false,
      message: "The local workflow email test is locked to the authorized personal test address.",
    };
  }

  try {
    const stage = source.stage ? STAGES.find((item) => item.key === source.stage) : undefined;
    const message: EmailMessage = {
      ...source,
      toUserId: "local-workflow-email-test",
      toName: WORKFLOW_TEST_NAME,
      toEmail: WORKFLOW_TEST_RECIPIENT,
      subject: `[TEST] ${source.subject}`,
      ctaLabel: "Review and Sign Request",
      read: false,
    };
    const email = renderEmailTemplate(
      message,
      siteUrl.origin,
      `/requests/${encodeURIComponent(request.id)}`,
      LOGO_CONTENT_ID,
      undefined,
      {
        department: request.department,
        purpose: request.purpose,
        destinations: request.destinations,
        passengers: request.passengers,
        dateStart: dateLabel(request.dateStart),
        dateEnd: dateLabel(request.dateEnd),
        currentStage: stage ? `${stage.label} — ${stage.title}` : undefined,
      },
    );
    const logo = await readFile(join(process.cwd(), "public", "loa-loading.png"));
    const relatedBoundary = `loa_related_${randomBytes(18).toString("hex")}`;
    const alternativeBoundary = `loa_alt_${randomBytes(18).toString("hex")}`;
    const mime = [
      `To: ${WORKFLOW_TEST_RECIPIENT}`,
      `Subject: ${encodedHeader(email.subject)}`,
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
      base64(email.text),
      `--${alternativeBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      base64(email.html),
      `--${alternativeBoundary}--`,
      `--${relatedBoundary}`,
      'Content-Type: image/png; name="loa-loading.png"',
      "Content-Transfer-Encoding: base64",
      `Content-ID: <${LOGO_CONTENT_ID}>`,
      'Content-Disposition: inline; filename="loa-loading.png"',
      "",
      base64(logo),
      `--${relatedBoundary}--`,
      "",
    ].join("\r\n");
    const token = await accessToken();
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64Url(mime) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.error(`[gmail-test] Workflow email send failed (${response.status}).`);
      return { sent: false, message: "Gmail did not accept the workflow test email." };
    }
    return { sent: true };
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "We couldn't prepare or send the workflow test email.";
    console.error(
      `[gmail-test] Workflow email failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return { sent: false, message };
  }
}

export async function sendTripTicketTestEmail(
  request: VehicleRequest,
  ticketImage: Buffer,
  preparedBy: string,
): Promise<WorkflowTestEmailResult | undefined> {
  if (process.env["NODE_ENV"] === "production") return undefined;

  let siteUrl: URL;
  try {
    siteUrl = new URL(publicSiteUrl());
  } catch (error) {
    console.error(
      `[gmail-test] Invalid local SITE_URL: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return { sent: false, message: "SITE_URL must be a valid URL for local email testing." };
  }
  if (!["localhost", "127.0.0.1"].includes(siteUrl.hostname)) return undefined;

  const recipient = serverEnvOptional("GOOGLE_TEST_RECIPIENT")?.toLowerCase();
  if (!recipient) {
    return { sent: false, message: "Configure GOOGLE_TEST_RECIPIENT for local email testing." };
  }
  if (recipient !== WORKFLOW_TEST_RECIPIENT) {
    return {
      sent: false,
      message: "The local ticket email test is locked to the authorized personal test address.",
    };
  }

  try {
    const message: EmailMessage = {
      id: "local-ticket-email-test",
      at: new Date().toISOString(),
      toUserId: "local-ticket-email-test",
      toName: WORKFLOW_TEST_NAME,
      toEmail: WORKFLOW_TEST_RECIPIENT,
      subject: `[TEST] Trip Ticket Ready — ${request.number}`,
      requestId: request.id,
      requestNumber: request.number,
      kind: "approved_requester",
      heading: "Test copy of the approved trip ticket",
      body: `This is a test email for request ${request.number}. The ticket was prepared by ${preparedBy}.`,
      ctaLabel: "Open Trip Ticket",
      read: false,
    };
    const ticketContentId = "trip-ticket-test-image";
    const email = renderEmailTemplate(
      message,
      siteUrl.origin,
      `/print/${encodeURIComponent(request.id)}`,
      LOGO_CONTENT_ID,
      ticketContentId,
      {
        department: request.department,
        purpose: request.purpose,
        destinations: request.destinations,
        passengers: request.passengers,
        dateStart: dateLabel(request.dateStart),
        dateEnd: dateLabel(request.dateEnd),
      },
    );
    const logo = await readFile(join(process.cwd(), "public", "loa-loading.png"));
    const relatedBoundary = `loa_related_${randomBytes(18).toString("hex")}`;
    const alternativeBoundary = `loa_alt_${randomBytes(18).toString("hex")}`;
    const mime = [
      `To: ${WORKFLOW_TEST_RECIPIENT}`,
      `Subject: ${encodedHeader(email.subject)}`,
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
      base64(email.text),
      `--${alternativeBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      base64(email.html),
      `--${alternativeBoundary}--`,
      `--${relatedBoundary}`,
      'Content-Type: image/png; name="loa-loading.png"',
      "Content-Transfer-Encoding: base64",
      `Content-ID: <${LOGO_CONTENT_ID}>`,
      'Content-Disposition: inline; filename="loa-loading.png"',
      "",
      base64(logo),
      `--${relatedBoundary}`,
      `Content-Type: image/png; name="${request.number}-trip-ticket.png"`,
      "Content-Transfer-Encoding: base64",
      `Content-ID: <${ticketContentId}>`,
      `Content-Disposition: inline; filename="${request.number}-trip-ticket.png"`,
      "",
      base64(ticketImage),
      `--${relatedBoundary}--`,
      "",
    ].join("\r\n");
    const token = await accessToken();
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64Url(mime) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.error(`[gmail-test] Ticket email send failed (${response.status}).`);
      return { sent: false, message: "Gmail did not accept the trip-ticket test email." };
    }
    return { sent: true };
  } catch (error) {
    console.error(
      `[gmail-test] Ticket email failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return { sent: false, message: "We couldn't prepare or send the trip-ticket test email." };
  }
}

export async function sendRegistrationOtpEmail(
  recipient: string,
  recipientName: string,
  code: string,
  expiresInMinutes: number,
): Promise<void> {
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

  const relatedBoundary = `loa_related_${randomBytes(18).toString("hex")}`;
  const alternativeBoundary = `loa_alt_${randomBytes(18).toString("hex")}`;
  const mime = [
    `To: ${recipient}`,
    `Subject: ${encodedHeader(email.subject)}`,
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
    base64(email.text),
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64(email.html),
    `--${alternativeBoundary}--`,
    `--${relatedBoundary}`,
    'Content-Type: image/png; name="loa-loading.png"',
    "Content-Transfer-Encoding: base64",
    `Content-ID: <${LOGO_CONTENT_ID}>`,
    'Content-Disposition: inline; filename="loa-loading.png"',
    "",
    base64(logo),
    `--${relatedBoundary}--`,
    "",
  ].join("\r\n");

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
    throw new AppError("We couldn't send the verification email. Please try again later.");
  }
  if (!response.ok) {
    console.error(`[gmail] Message send failed (${response.status}).`);
    throw new AppError("We couldn't send the verification email. Please try again later.");
  }
}
