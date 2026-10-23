import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderRegistrationOtpEmail } from "@/lib/email-template";
import { AppError } from "@/lib/errors";
import { serverEnvOptional } from "./env";

interface GoogleTokenResponse {
  access_token?: string;
}

const LOGO_CONTENT_ID = "loa-header-logo";

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
