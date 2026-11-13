import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { googleAccountProblem, googleSignInDestination, safeSignInNext } from "@/lib/google-signin";
import { normaliseEmail } from "@/lib/validation";
import {
  GOOGLE_MODE_COOKIE,
  GOOGLE_NEXT_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  clearedSignInCookie,
  googleSignInCredentials,
  googleSignInRedirectUri,
} from "@/server/google-signin";

interface GoogleTokenResponse {
  access_token?: string;
}

interface GoogleUserInfo {
  email?: string;
  email_verified?: boolean;
  verified_email?: boolean;
}

function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
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

async function googleJson<T>(
  url: string,
  init: RequestInit,
  onProviderError?: (providerCode: string) => void,
): Promise<T | null> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      let providerCode = "unknown";
      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === "string" && /^[a-z_]+$/.test(body.error)) {
          providerCode = body.error;
        }
      } catch {
        // A non-JSON error response has no safe provider code to log.
      }
      console.error(`[google-signin] Google request failed (${response.status}, ${providerCode}).`);
      onProviderError?.(providerCode);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error(
      `[google-signin] Google request failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
    return null;
  }
}

function failure(code: string, cookies: string[], mode: "requisitioner" | "hrdo" | "external") {
  const destination = mode === "hrdo" ? "/hrdo/login" : mode === "external" ? "/coe" : "/login";
  return redirect(`${destination}?error=${encodeURIComponent(code)}`, cookies);
}

export const Route = createFileRoute("/api/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const redirectUri = googleSignInRedirectUri(url);
        let secure = false;
        try {
          secure = new URL(redirectUri).protocol === "https:";
        } catch {
          secure = url.protocol === "https:";
        }

        const mode = (cookieValue(request, GOOGLE_MODE_COOKIE) ?? "requisitioner") as
          "requisitioner" | "hrdo" | "external";
        const cleared = [
          clearedSignInCookie(GOOGLE_STATE_COOKIE, secure),
          clearedSignInCookie(GOOGLE_VERIFIER_COOKIE, secure),
          clearedSignInCookie(GOOGLE_NEXT_COOKIE, secure),
          clearedSignInCookie(GOOGLE_MODE_COOKIE, secure),
        ];

        try {
          const state = url.searchParams.get("state") ?? "";
          const savedState = cookieValue(request, GOOGLE_STATE_COOKIE) ?? "";
          const verifier = cookieValue(request, GOOGLE_VERIFIER_COOKIE) ?? "";
          if (!state || !savedState || !verifier || !sameState(savedState, state)) {
            console.warn("[google-signin] Callback rejected: missing or mismatched OAuth state.");
            return failure("google_session", cleared, mode);
          }
          if (url.searchParams.get("error")) return failure("google_denied", cleared, mode);

          const code = url.searchParams.get("code");
          if (!code) {
            console.warn("[google-signin] Callback rejected: authorization code was missing.");
            return failure("google_session", cleared, mode);
          }

          const { clientId, clientSecret } = googleSignInCredentials(mode);
          if (!clientId || !clientSecret) return failure("google_unavailable", cleared, mode);

          let tokenErrorCode = "google_token";
          const tokens = await googleJson<GoogleTokenResponse>(
            "https://oauth2.googleapis.com/token",
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                code_verifier: verifier,
                grant_type: "authorization_code",
              }),
            },
            (providerCode) => {
              if (
                ["invalid_client", "unauthorized_client", "redirect_uri_mismatch"].includes(
                  providerCode,
                )
              ) {
                tokenErrorCode = "google_configuration";
              } else if (providerCode === "invalid_grant") {
                tokenErrorCode = "google_session";
              }
            },
          );
          if (!tokens?.access_token) return failure(tokenErrorCode, cleared, mode);

          const identity = await googleJson<GoogleUserInfo>(
            "https://openidconnect.googleapis.com/v1/userinfo",
            { headers: { Authorization: `Bearer ${tokens.access_token}` } },
          );
          if (!identity?.email || !(identity.email_verified ?? identity.verified_email)) {
            return failure("google_profile", cleared, mode);
          }

          const email = normaliseEmail(identity.email);

          if (mode === "hrdo" || mode === "external") {
            if (mode === "external") {
              const accountProblem = googleAccountProblem(email, null, "external");
              if (accountProblem) return failure(accountProblem, cleared, mode);
            }
            if (mode === "hrdo") {
              const accountProblem = googleAccountProblem(email, null);
              if (accountProblem) return failure(accountProblem, cleared, mode);
            }

            const [{ ensureHrdoGoogleAccount, hrdoCreateSession }, { encryptedCookieRequired }] =
              await Promise.all([import("@/server/hrdo/auth"), import("@/server/env")]);

            const account = await ensureHrdoGoogleAccount(email, mode === "external");
            if (
              account.role !== "employee" &&
              account.role !== "hrdo_staff" &&
              account.role !== "hrdo_admin"
            ) {
              return failure("google_role", cleared, mode);
            }

            const { token, maxAge } = await hrdoCreateSession(account.id);
            const sessionCookie = `loa_hrdo_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${
              encryptedCookieRequired() || secure ? "; Secure" : ""
            }`;

            let nextTarget = mode === "external" ? "/hrdo/coe" : "/hrdo/dashboard";
            try {
              nextTarget =
                decodeURIComponent(cookieValue(request, GOOGLE_NEXT_COOKIE) ?? "") || nextTarget;
            } catch {
              // ignore malformed next target and keep the HRDO dashboard as the fallback.
            }

            if (mode === "hrdo" && account.isNew) {
              return redirect("/hrdo/complete-profile", [...cleared, sessionCookie]);
            }

            return redirect(
              account.mustChangePassword ? "/hrdo/change-password" : safeSignInNext(nextTarget),
              [...cleared, sessionCookie],
            );
          }

          const [
            { createSession, ensureGoogleRequisitionerAccount, SESSION_COOKIE_NAME },
            { encryptedCookieRequired },
          ] = await Promise.all([import("@/server/auth"), import("@/server/env")]);

          const domainProblem = googleAccountProblem(email, null);
          if (domainProblem) return failure(domainProblem, cleared, mode);

          const requisitionerAccount = await ensureGoogleRequisitionerAccount(email);
          const problem = googleAccountProblem(email, requisitionerAccount.role);
          if (problem) return failure(problem, cleared, mode);

          const { token, maxAge } = await createSession(requisitionerAccount.id);
          let nextTarget = "";
          try {
            nextTarget = decodeURIComponent(cookieValue(request, GOOGLE_NEXT_COOKIE) ?? "");
          } catch {
            nextTarget = "";
          }
          const next = safeSignInNext(nextTarget);
          const sessionCookie2 = `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${
            encryptedCookieRequired() || secure ? "; Secure" : ""
          }`;

          const target = googleSignInDestination(requisitionerAccount, next);

          return redirect(target, [...cleared, sessionCookie2]);
        } catch (error) {
          console.error(
            `[google-signin] Callback failed: ${error instanceof Error ? error.message : "unknown error"}`,
          );
          return failure("google_server", cleared, mode);
        }
      },
    },
  },
});
