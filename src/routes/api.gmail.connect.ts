import { randomBytes } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { serverEnvOptional } from "@/server/env";

const STATE_COOKIE = "gmail_oauth_state";
const CALLBACK_PATH = "/api/gmail/callback";

function unavailable() {
  return new Response("Gmail authorization is only available in local development.", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export const Route = createFileRoute("/api/gmail/connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (process.env["NODE_ENV"] === "production") return unavailable();
        const requestUrl = new URL(request.url);
        if (!["localhost", "127.0.0.1"].includes(requestUrl.hostname)) return unavailable();

        const clientId = serverEnvOptional("GOOGLE_CLIENT_ID");
        const clientSecret = serverEnvOptional("GOOGLE_CLIENT_SECRET");
        const redirectUri = serverEnvOptional("GOOGLE_REDIRECT_URI");
        const senderEmail = serverEnvOptional("GOOGLE_SENDER_EMAIL")?.toLowerCase();
        if (!clientId || !clientSecret || !redirectUri || !senderEmail) {
          return new Response(
            "Configure Google OAuth credentials, callback URL, and the approved sender address in .env.",
            {
              status: 503,
              headers: {
                "Cache-Control": "no-store",
                "Content-Type": "text/plain; charset=utf-8",
                "X-Content-Type-Options": "nosniff",
              },
            },
          );
        }

        let callback: URL;
        try {
          callback = new URL(redirectUri);
        } catch {
          return new Response("GOOGLE_REDIRECT_URI must be a valid URL.", {
            status: 503,
            headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
          });
        }
        if (
          !["http:", "https:"].includes(callback.protocol) ||
          !["localhost", "127.0.0.1"].includes(callback.hostname) ||
          callback.hostname !== requestUrl.hostname ||
          callback.pathname !== CALLBACK_PATH ||
          callback.search ||
          callback.hash
        ) {
          return new Response(
            `GOOGLE_REDIRECT_URI must be a localhost URL ending in ${CALLBACK_PATH}.`,
            {
              status: 503,
              headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
            },
          );
        }

        const state = randomBytes(32).toString("base64url");
        const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        googleUrl.search = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope:
            "openid email https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.send",
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          login_hint: senderEmail,
          state,
        }).toString();

        const secureCookie = callback.protocol === "https:" ? "; Secure" : "";
        const headers = new Headers({
          Location: googleUrl.toString(),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        headers.append(
          "Set-Cookie",
          `${STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=${CALLBACK_PATH}; Max-Age=600${secureCookie}`,
        );
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
