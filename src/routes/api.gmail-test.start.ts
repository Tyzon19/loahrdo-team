import { randomBytes } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { serverEnvOptional } from "@/server/env";

const TEST_RECIPIENT = "mj.turingan@lyceumalabang.edu.ph";

function unavailable() {
  return new Response("Gmail test sending is only available in local development.", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export const Route = createFileRoute("/api/gmail-test/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (process.env["NODE_ENV"] === "production") return unavailable();

        const requestUrl = new URL(request.url);
        if (!["localhost", "127.0.0.1"].includes(requestUrl.hostname)) return unavailable();
        const template = requestUrl.searchParams.get("template") ?? "approved-ticket";
        if (
          ![
            "approved-ticket",
            "registration-otp",
            "gmail-connect",
            "action-review",
            "action-recommendation",
            "action-approval",
          ].includes(template)
        ) {
          return new Response("Unknown email template preview.", {
            status: 400,
            headers: {
              "Cache-Control": "no-store",
              "Content-Type": "text/plain; charset=utf-8",
              "X-Content-Type-Options": "nosniff",
            },
          });
        }

        const clientId = serverEnvOptional("GOOGLE_CLIENT_ID");
        const clientSecret = serverEnvOptional("GOOGLE_CLIENT_SECRET");
        const redirectUri = serverEnvOptional("GOOGLE_REDIRECT_URI");
        const recipient = serverEnvOptional("GOOGLE_TEST_RECIPIENT");
        if (!clientId || !clientSecret || !redirectUri || !recipient) {
          return new Response(
            "Configure Google OAuth credentials, callback URL, and test recipient in local .env.",
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
          callback.protocol !== "http:" ||
          !["localhost", "127.0.0.1"].includes(callback.hostname) ||
          recipient.trim().toLowerCase() !== TEST_RECIPIENT
        ) {
          return new Response("Configure a localhost callback and the authorized test recipient.", {
            status: 503,
            headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
          });
        }

        const state = randomBytes(32).toString("base64url");
        const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        googleUrl.search = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "https://www.googleapis.com/auth/gmail.send",
          access_type: "offline",
          prompt: "consent",
          state,
        }).toString();

        const secureCookie = "";
        const headers = new Headers({
          Location: googleUrl.toString(),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        headers.append(
          "Set-Cookie",
          `gmail_test_state=${state}; HttpOnly; SameSite=Lax; Path=/api/gmail-test/callback; Max-Age=600${secureCookie}`,
        );
        headers.append(
          "Set-Cookie",
          `gmail_test_template=${template}; HttpOnly; SameSite=Lax; Path=/api/gmail-test/callback; Max-Age=600${secureCookie}`,
        );
        return new Response(null, {
          status: 302,
          headers,
        });
      },
    },
  },
});
