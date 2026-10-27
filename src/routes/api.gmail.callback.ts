import { timingSafeEqual } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createFileRoute } from "@tanstack/react-router";
import { serverEnvOptional } from "@/server/env";

const STATE_COOKIE = "gmail_oauth_state";
const CALLBACK_PATH = "/api/gmail/callback";

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
}

interface GoogleUserInfo {
  email?: string;
  email_verified?: boolean;
  verified_email?: boolean;
}

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

function sameState(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

function clearStateCookie(secure: boolean): string {
  return `${STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=${CALLBACK_PATH}; Max-Age=0${secure ? "; Secure" : ""}`;
}

async function storeRefreshToken(refreshToken: string) {
  if (/[\r\n]/.test(refreshToken)) throw new Error("Google returned an invalid refresh token.");
  const envPath = join(process.cwd(), ".env");
  const content = await readFile(envPath, "utf8");
  const line = `GOOGLE_REFRESH_TOKEN=${refreshToken}`;
  const pattern = /^GOOGLE_REFRESH_TOKEN=.*$/m;
  const updated = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.trimEnd()}\n${line}\n`;
  await writeFile(envPath, updated, { mode: 0o600 });
  process.env["GOOGLE_REFRESH_TOKEN"] = refreshToken;
}

export const Route = createFileRoute("/api/gmail/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (process.env["NODE_ENV"] === "production") {
          return htmlPage("Not available", "Gmail authorization is only available locally.", 404);
        }

        const url = new URL(request.url);
        if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
          return htmlPage("Not available", "Gmail authorization is only available locally.", 404);
        }

        const redirectUri = serverEnvOptional("GOOGLE_REDIRECT_URI");
        const clientId = serverEnvOptional("GOOGLE_CLIENT_ID");
        const clientSecret = serverEnvOptional("GOOGLE_CLIENT_SECRET");
        const senderEmail = serverEnvOptional("GOOGLE_SENDER_EMAIL")?.toLowerCase();
        if (!redirectUri || !clientId || !clientSecret || !senderEmail) {
          return htmlPage("Gmail is not configured", "Check the local .env settings.", 503);
        }

        let callback: URL;
        try {
          callback = new URL(redirectUri);
        } catch {
          return htmlPage("Gmail is not configured", "GOOGLE_REDIRECT_URI is invalid.", 503);
        }
        if (
          callback.origin !== url.origin ||
          callback.pathname !== CALLBACK_PATH ||
          callback.search ||
          callback.hash
        ) {
          return htmlPage("Not available", "This Gmail callback URL is not configured.", 404);
        }

        const callbackState = url.searchParams.get("state") ?? "";
        const savedState = cookieValue(request, STATE_COOKIE) ?? "";
        if (!callbackState || !savedState || !sameState(savedState, callbackState)) {
          return htmlPage(
            "Authorization expired",
            "The authorization state could not be verified. Start Gmail connection again.",
            400,
          );
        }

        const headers = new Headers({
          "Set-Cookie": clearStateCookie(callback.protocol === "https:"),
        });
        const googleError = url.searchParams.get("error");
        if (googleError) {
          const response = htmlPage(
            "Authorization cancelled",
            "Google access was not granted.",
            400,
          );
          headers.forEach((value, key) => response.headers.append(key, value));
          return response;
        }

        const code = url.searchParams.get("code");
        if (!code) {
          const response = htmlPage(
            "Authorization failed",
            "Google did not return an authorization code.",
            400,
          );
          headers.forEach((value, key) => response.headers.append(key, value));
          return response;
        }

        let tokenResponse: Response;
        try {
          tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
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
        } catch (error) {
          console.error(
            `[gmail] Authorization exchange failed: ${error instanceof Error ? error.name : "unknown"}`,
          );
          const response = htmlPage(
            "Gmail connection failed",
            "Google could not be reached. Try connecting Gmail again.",
            502,
          );
          headers.forEach((value, key) => response.headers.append(key, value));
          return response;
        }
        if (!tokenResponse.ok) {
          console.error(`[gmail] Authorization exchange failed (${tokenResponse.status}).`);
          const response = htmlPage(
            "Gmail connection failed",
            "Google rejected the authorization. Check the OAuth client and callback URL.",
            502,
          );
          headers.forEach((value, key) => response.headers.append(key, value));
          return response;
        }

        const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
        if (!tokens.access_token || !tokens.refresh_token) {
          const response = htmlPage(
            "Gmail connection failed",
            "Google did not provide a refresh token. Restart the connection and grant access.",
            502,
          );
          headers.forEach((value, key) => response.headers.append(key, value));
          return response;
        }

        let identityResponse: Response;
        try {
          identityResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
            signal: AbortSignal.timeout(15_000),
          });
        } catch (error) {
          console.error(
            `[gmail] Account verification failed: ${error instanceof Error ? error.name : "unknown"}`,
          );
          const response = htmlPage(
            "Gmail connection failed",
            "The authorized account could not be verified. Try again.",
            502,
          );
          headers.forEach((value, key) => response.headers.append(key, value));
          return response;
        }
        if (!identityResponse.ok) {
          console.error(`[gmail] Account verification failed (${identityResponse.status}).`);
          const response = htmlPage(
            "Gmail connection failed",
            "The authorized account could not be verified. Try again.",
            502,
          );
          headers.forEach((value, key) => response.headers.append(key, value));
          return response;
        }
        const identity = (await identityResponse.json()) as GoogleUserInfo;
        if (!identity.email || !(identity.email_verified ?? identity.verified_email)) {
          const response = htmlPage(
            "Gmail connection failed",
            "Google did not verify the authorized account email.",
            502,
          );
          headers.forEach((value, key) => response.headers.append(key, value));
          return response;
        }
        if (identity.email.toLowerCase() !== senderEmail) {
          const response = htmlPage(
            "Wrong Gmail account",
            `Connect ${senderEmail}, the approved personal sender account. No credentials were saved and no email was sent.`,
            403,
          );
          headers.forEach((value, key) => response.headers.append(key, value));
          return response;
        }
        try {
          await storeRefreshToken(tokens.refresh_token);
        } catch (error) {
          console.error(
            `[gmail] Could not save local credentials: ${error instanceof Error ? error.name : "unknown"}`,
          );
          const response = htmlPage(
            "Gmail connection failed",
            "Could not save credentials to the local .env file. No email was sent.",
            500,
          );
          headers.forEach((value, key) => response.headers.append(key, value));
          return response;
        }

        const response = htmlPage(
          "Gmail connected",
          `The approved sender ${identity.email} is connected. Workflow requests go to the configured signatory accounts, and trip tickets go to the request owner's account. No test email was sent. Restart the app before using these credentials in another environment.`,
        );
        headers.forEach((value, key) => response.headers.append(key, value));
        return response;
      },
    },
  },
});
