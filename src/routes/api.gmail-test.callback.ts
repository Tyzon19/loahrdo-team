import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createFileRoute } from "@tanstack/react-router";
import { renderEmailTemplate, renderRegistrationOtpEmail } from "@/lib/email-template";
import type { EmailMessage } from "@/lib/types";
import { publicSiteUrl, serverEnvOptional } from "@/server/env";
import type { RowDataPacket } from "mysql2/promise";
import { all } from "@/server/db";

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
}

const COOKIE = "gmail_test_state";
const TEST_RECIPIENT = "mj.turingan@lyceumalabang.edu.ph";
const LOGO_CONTENT_ID = "loa-header-logo";
const TICKET_CONTENT_ID = "approved-trip-ticket";

interface SampleTicketRow extends RowDataPacket {
  id: string;
  number: string;
  requisitioner_name: string;
  department: string;
  purpose: string;
  passengers: number;
  date_start: Date | string;
  date_end: Date | string;
  destinations: string;
  image: Buffer;
}

interface WorkflowSampleRow extends RowDataPacket {
  id: string;
  number: string;
  department: string;
  purpose: string;
  passengers: number;
  date_start: Date | string;
  date_end: Date | string;
  destinations: string | null;
}

const ACTION_TESTS = {
  "action-review": {
    kind: "action_review",
    stage: "review",
    subject: "Action Required",
    heading: "A vehicle request is waiting for your review.",
    body: "TEST EMAIL: This sample represents the first approval notice, sent to the Head of Transport Services when a requisitioner submits a request. No approval action was taken.",
    currentStage: "Reviewed By — Head of Transport Services",
  },
  "action-recommendation": {
    kind: "action_recommend",
    stage: "recommend",
    subject: "Action Required",
    heading: "A vehicle request is waiting for your recommending approval.",
    body: "TEST EMAIL: This sample represents the notice sent to the Director for Administration after the Head of Transport Services signs. No approval action was taken.",
    currentStage: "Recommending Approval — Director for Administration",
  },
  "action-approval": {
    kind: "action_approve",
    stage: "approve",
    subject: "Final Approval Required",
    heading: "A vehicle request is waiting for your final approval.",
    body: "TEST EMAIL: This sample represents the notice sent to the President after the Director for Administration signs. No approval action was taken.",
    currentStage: "Approved By — President",
  },
} as const;

function htmlPage(title: string, message: string, status = 200) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><body style="margin:0;padding:40px 16px;background:#f3f5f8;font:16px Arial,sans-serif;color:#172033"><main style="box-sizing:border-box;max-width:520px;margin:auto;padding:28px;background:white;border:1px solid #e2e7ef;border-radius:8px"><h1 style="font-size:22px;color:#172b4d">${safeTitle}</h1><p style="line-height:1.6">${safeMessage}</p></main></body></html>`,
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function cookieValue(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const item = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));
  return item?.slice(name.length + 1);
}
function clearStateCookie(secure: boolean): string {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/gmail-test/callback; Max-Age=0${secure ? "; Secure" : ""}`;
}
function clearTemplateCookie(secure: boolean): string {
  return `gmail_test_template=; HttpOnly; SameSite=Lax; Path=/api/gmail-test/callback; Max-Age=0${secure ? "; Secure" : ""}`;
}
function sameState(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function mimeBase64(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/.{1,76}/g, "$&\r\n")
    .trimEnd();
}

function encodedHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function dateLabel(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00+08:00`);
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(date);
}

async function storeRefreshToken(token: string) {
  if (/[\r\n]/.test(token)) throw new Error("Google returned an invalid refresh token.");
  const envPath = join(process.cwd(), ".env");
  const content = await readFile(envPath, "utf8");
  const line = `GOOGLE_REFRESH_TOKEN=${token}`;
  const updated = /^GOOGLE_REFRESH_TOKEN=.*$/m.test(content)
    ? content.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, line)
    : `${content.trimEnd()}\n${line}\n`;
  await writeFile(envPath, updated, { mode: 0o600 });
  process.env["GOOGLE_REFRESH_TOKEN"] = token;
}

export const Route = createFileRoute("/api/gmail-test/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (process.env["NODE_ENV"] === "production") {
          return htmlPage("Not available", "Email test sending is only available locally.", 404);
        }

        const url = new URL(request.url);
        if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
          return htmlPage("Not available", "Email test sending is only available locally.", 404);
        }

        const redirectUri = serverEnvOptional("GOOGLE_REDIRECT_URI");
        const configuredRecipient = serverEnvOptional("GOOGLE_TEST_RECIPIENT");
        const clientId = serverEnvOptional("GOOGLE_CLIENT_ID");
        const clientSecret = serverEnvOptional("GOOGLE_CLIENT_SECRET");
        if (!redirectUri || !configuredRecipient || !clientId || !clientSecret) {
          return htmlPage("Email test is not configured", "Check the local .env settings.", 503);
        }

        const callbackState = url.searchParams.get("state") ?? "";
        const savedState = cookieValue(request, COOKIE) ?? "";
        if (!callbackState || !savedState || !sameState(savedState, callbackState)) {
          return htmlPage(
            "Authorization expired",
            "The authorization state could not be verified. Start the test again.",
            400,
          );
        }

        const googleError = url.searchParams.get("error");
        if (googleError) {
          return htmlPage("Authorization cancelled", "Google access was not granted.", 400);
        }

        const code = url.searchParams.get("code");
        if (!code) {
          return htmlPage(
            "Authorization failed",
            "Google did not return an authorization code.",
            400,
          );
        }

        const secureCookie = new URL(redirectUri).protocol === "https:";
        const responseHeaders = new Headers({
          "Cache-Control": "no-store",
          "Set-Cookie": clearStateCookie(secureCookie),
        });
        responseHeaders.append("Set-Cookie", clearTemplateCookie(secureCookie));

        try {
          const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
            }),
            signal: AbortSignal.timeout(15_000),
          });
          if (!tokenResponse.ok) {
            console.error(`[gmail-test] OAuth token exchange failed (${tokenResponse.status}).`);
            return htmlPage(
              "Authorization failed",
              "Could not complete Google authorization.",
              502,
            );
          }

          const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
          if (!tokens.access_token) {
            console.error("[gmail-test] Google token response did not include an access token.");
            return htmlPage("Authorization failed", "Google did not grant email access.", 502);
          }

          const recipient = configuredRecipient.trim().toLowerCase();
          if (recipient !== TEST_RECIPIENT) {
            return htmlPage(
              "Email test recipient mismatch",
              "This one-time test is locked to the personal email address requested.",
              403,
            );
          }
          if (cookieValue(request, "gmail_test_template") === "gmail-connect") {
            if (!tokens.refresh_token) {
              return htmlPage(
                "Gmail connection not completed",
                "Google did not issue a refresh token. Start the connection again and grant access when prompted.",
                502,
              );
            }
            await storeRefreshToken(tokens.refresh_token);
            responseHeaders.set("Content-Type", "text/html; charset=utf-8");
            responseHeaders.set(
              "Content-Security-Policy",
              "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
            );
            responseHeaders.set("Referrer-Policy", "no-referrer");
            responseHeaders.set("X-Content-Type-Options", "nosniff");
            return new Response(
              `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gmail connected</title><body style="margin:0;padding:40px 16px;background:#f3f5f8;font:16px Arial,sans-serif;color:#172033"><main style="box-sizing:border-box;max-width:520px;margin:auto;padding:28px;background:white;border:1px solid #e2e7ef;border-radius:8px"><h1 style="font-size:22px;color:#172b4d">Gmail connected</h1><p style="line-height:1.6">The Gmail sender is now configured locally for registration verification. The refresh token was saved to your ignored .env file and was not displayed.</p><p style="line-height:1.6">Restart the development server before testing registration.</p></main></body></html>`,
              { headers: responseHeaders },
            );
          }
          const template = cookieValue(request, "gmail_test_template") ?? "";
          const isOtpPreview = template === "registration-otp";
          const actionTest = Object.entries(ACTION_TESTS).find(([key]) => key === template)?.[1];
          let email: ReturnType<typeof renderEmailTemplate>;
          let ticketImage: Buffer | undefined;
          if (isOtpPreview) {
            email = renderRegistrationOtpEmail(
              {
                recipientName: "Mark Joseph Turingan",
                code: "482913",
                expiresInMinutes: 10,
              },
              LOGO_CONTENT_ID,
            );
          } else if (actionTest) {
            const samples = await all<WorkflowSampleRow[]>(
              `SELECT r.id, r.number, r.department, r.purpose, r.passengers,
                      r.date_start, r.date_end,
                      GROUP_CONCAT(DISTINCT d.destination ORDER BY d.sort_order SEPARATOR ', ') AS destinations
               FROM requests r
               JOIN users u ON u.id = r.requisitioner_id
               LEFT JOIN request_destinations d ON d.request_id = r.id
               WHERE LOWER(u.email) = ?
               GROUP BY r.id
               ORDER BY r.submitted_at DESC
               LIMIT 1`,
              [recipient],
            );
            const sample = samples[0];
            if (!sample) {
              return htmlPage(
                "No test request is ready",
                "Submit a request from the configured test account first. The approval email test only uses requests owned by that account.",
                404,
              );
            }
            const message: EmailMessage = {
              id: randomBytes(16).toString("hex"),
              at: new Date().toISOString(),
              toUserId: "email-template-test",
              toName: "MJ Turingan",
              toEmail: recipient,
              subject: `[TEST] [LOA Vehicle Request] ${actionTest.subject} — ${sample.number}`,
              requestId: sample.id,
              requestNumber: sample.number,
              kind: actionTest.kind,
              stage: actionTest.stage,
              heading: actionTest.heading,
              body: actionTest.body,
              ctaLabel: "Review and Sign Request",
              read: false,
            };
            email = renderEmailTemplate(
              message,
              publicSiteUrl(),
              `/requests/${sample.id}`,
              LOGO_CONTENT_ID,
              undefined,
              {
                department: sample.department,
                purpose: sample.purpose,
                destinations: sample.destinations?.split(", ") ?? [],
                passengers: sample.passengers,
                dateStart: dateLabel(sample.date_start),
                dateEnd: dateLabel(sample.date_end),
                currentStage: actionTest.currentStage,
              },
            );
          } else {
            const samples = await all<SampleTicketRow[]>(
              `SELECT r.id, r.number, r.requisitioner_name, r.department, r.purpose,
                      r.passengers, r.date_start, r.date_end,
                      GROUP_CONCAT(DISTINCT d.destination ORDER BY d.sort_order SEPARATOR ', ') AS destinations,
                      a.image
               FROM requests r
               JOIN notifications n
                 ON n.request_id = r.id
                AND n.to_user_id = r.requisitioner_id
                AND n.kind = 'approved_requester'
                AND LOWER(n.to_email) = ?
               JOIN notification_attachments a ON a.notification_id = n.id
               JOIN request_signatures s
                 ON s.request_id = r.id
                AND s.attempt = r.attempt
                AND s.stage = 'approve'
               LEFT JOIN request_destinations d ON d.request_id = r.id
               WHERE r.status IN ('approved', 'dispatched', 'completed')
               GROUP BY r.id, n.id, a.notification_id
               ORDER BY r.approved_at DESC
               LIMIT 1`,
              [recipient],
            );
            const sample = samples[0];
            if (!sample) {
              return htmlPage(
                "No approved ticket sample is ready",
                "There is no final-approved request with a saved trip-ticket image to use for the sample email.",
                404,
              );
            }
            ticketImage = Buffer.from(sample.image);
            if (!ticketImage.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
              console.error("[gmail-test] The selected approved ticket image is not a PNG.");
              return htmlPage(
                "Ticket image unavailable",
                "The sample ticket image is invalid.",
                500,
              );
            }
            const message: EmailMessage = {
              id: randomBytes(16).toString("hex"),
              at: new Date().toISOString(),
              toUserId: "email-template-test",
              toName: sample.requisitioner_name,
              toEmail: recipient,
              subject: `[LOA Vehicle Request] Trip ticket ready — ${sample.number}`,
              requestId: sample.id,
              requestNumber: sample.number,
              kind: "approved_requester",
              heading: "Your vehicle request has received final approval.",
              body: "The President has approved your vehicle request. Your trip ticket is shown below and included as an image attachment.",
              ctaLabel: "View trip ticket",
              read: false,
            };
            email = renderEmailTemplate(
              message,
              publicSiteUrl(),
              `/print/${sample.id}`,
              LOGO_CONTENT_ID,
              TICKET_CONTENT_ID,
              {
                department: sample.department,
                purpose: sample.purpose,
                destinations: sample.destinations?.split(", ") ?? [],
                passengers: sample.passengers,
                dateStart: dateLabel(sample.date_start),
                dateEnd: dateLabel(sample.date_end),
              },
            );
          }
          const logo = await readFile(join(process.cwd(), "public", "loa-loading.png"));
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
            mimeBase64(email.text),
            `--${alternativeBoundary}`,
            'Content-Type: text/html; charset="UTF-8"',
            "Content-Transfer-Encoding: base64",
            "",
            mimeBase64(email.html),
            `--${alternativeBoundary}--`,
            ...(ticketImage
              ? [
                  `--${relatedBoundary}`,
                  'Content-Type: image/png; name="approved-trip-ticket.png"',
                  "Content-Transfer-Encoding: base64",
                  `Content-ID: <${TICKET_CONTENT_ID}>`,
                  'Content-Disposition: inline; filename="approved-trip-ticket.png"',
                  "",
                  mimeBase64(ticketImage),
                ]
              : []),
            `--${relatedBoundary}`,
            'Content-Type: image/png; name="loa-loading.png"',
            "Content-Transfer-Encoding: base64",
            `Content-ID: <${LOGO_CONTENT_ID}>`,
            'Content-Disposition: inline; filename="loa-loading.png"',
            "",
            mimeBase64(logo),
            `--${relatedBoundary}--`,
            "",
          ].join("\r\n");

          const sendResponse = await fetch(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${tokens.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ raw: base64Url(mime) }),
              signal: AbortSignal.timeout(15_000),
            },
          );
          if (!sendResponse.ok) {
            console.error(`[gmail-test] Gmail send failed (${sendResponse.status}).`);
            return htmlPage(
              "Email was not sent",
              "Gmail did not accept the test message. Check Gmail API access, consent-screen test users, and sender authorization.",
              502,
            );
          }

          responseHeaders.set("Content-Type", "text/html; charset=utf-8");
          responseHeaders.set(
            "Content-Security-Policy",
            "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
          );
          responseHeaders.set("Referrer-Policy", "no-referrer");
          responseHeaders.set("X-Content-Type-Options", "nosniff");
          return new Response(
            `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email sent</title><body style="margin:0;padding:40px 16px;background:#f3f5f8;font:16px Arial,sans-serif;color:#172033"><main style="box-sizing:border-box;max-width:520px;margin:auto;padding:28px;background:white;border:1px solid #e2e7ef;border-radius:8px"><h1 style="font-size:22px;color:#172b4d">Test email sent</h1><p style="line-height:1.6">The ${isOtpPreview ? "registration OTP preview" : "trip-ticket template test"} was sent to ${escapeHtml(recipient)}. Check your inbox and spam folder.</p></main></body></html>`,
            { headers: responseHeaders },
          );
        } catch (error) {
          console.error(
            `[gmail-test] Could not send test email: ${error instanceof Error ? error.message : "unknown error"}`,
          );
          return htmlPage(
            "Email was not sent",
            "A network or configuration error interrupted the test.",
            502,
          );
        }
      },
    },
  },
});
