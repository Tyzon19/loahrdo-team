import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { googleAccountProblem, safeSignInNext } from "@/lib/google-signin";
import { normaliseEmail } from "@/lib/validation";
import {
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

async function googleJson<T>(url: string, init: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      console.error(`[google-signin] Google request failed (${response.status}).`);
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

function failure(code: string, cookies: string[]) {
  return redirect(`/login?error=${encodeURIComponent(code)}`, cookies);
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

        const cleared = [
          clearedSignInCookie(GOOGLE_STATE_COOKIE, secure),
          clearedSignInCookie(GOOGLE_VERIFIER_COOKIE, secure),
          clearedSignInCookie(GOOGLE_NEXT_COOKIE, secure),
        ];

        const state = url.searchParams.get("state") ?? "";
        const savedState = cookieValue(request, GOOGLE_STATE_COOKIE) ?? "";
        const verifier = cookieValue(request, GOOGLE_VERIFIER_COOKIE) ?? "";
        if (!state || !savedState || !verifier || !sameState(savedState, state)) {
          return failure("google_failed", cleared);
        }
        if (url.searchParams.get("error")) return failure("google_denied", cleared);

        const code = url.searchParams.get("code");
        if (!code) return failure("google_failed", cleared);

        const { clientId, clientSecret } = googleSignInCredentials();
        if (!clientId || !clientSecret) return failure("google_unavailable", cleared);

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
        );
        if (!tokens?.access_token) return failure("google_failed", cleared);

        const identity = await googleJson<GoogleUserInfo>(
          "https://openidconnect.googleapis.com/v1/userinfo",
          { headers: { Authorization: `Bearer ${tokens.access_token}` } },
        );
        if (!identity?.email || !(identity.email_verified ?? identity.verified_email)) {
          return failure("google_failed", cleared);
        }

        const email = normaliseEmail(identity.email);
        const [
          { googleSignInAccount, createSession, SESSION_COOKIE_NAME },
          { encryptedCookieRequired },
        ] = await Promise.all([import("@/server/auth"), import("@/server/env")]);

        const account = await googleSignInAccount(email);
        const problem = googleAccountProblem(email, account?.role ?? null);
        if (problem || !account) return failure(problem ?? "google_failed", cleared);

        const { token, maxAge } = await createSession(account.id);
        let nextTarget = "";
        try {
          nextTarget = decodeURIComponent(cookieValue(request, GOOGLE_NEXT_COOKIE) ?? "");
        } catch {
          nextTarget = "";
        }
        const next = safeSignInNext(nextTarget);
        const sessionCookie = `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${
          encryptedCookieRequired() || secure ? "; Secure" : ""
        }`;

        return redirect(account.mustChangePassword ? "/change-password" : next, [
          ...cleared,
          sessionCookie,
        ]);
      },
    },
  },
});
