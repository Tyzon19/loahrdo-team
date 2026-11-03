import { createHash, randomBytes } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { safeSignInNext } from "@/lib/google-signin";
import {
  GOOGLE_MODE_COOKIE,
  GOOGLE_NEXT_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  googleSignInCredentials,
  googleSignInMode,
  googleSignInRedirectUri,
  signInCookie,
} from "@/server/google-signin";

function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export const Route = createFileRoute("/api/auth/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const { clientId, clientSecret } = googleSignInCredentials();
        if (!clientId || !clientSecret) {
          return redirect("/login?error=google_unavailable");
        }

        const redirectUri = googleSignInRedirectUri(requestUrl);
        let secure = false;
        try {
          secure = new URL(redirectUri).protocol === "https:";
        } catch {
          return redirect("/login?error=google_unavailable");
        }

        const mode = googleSignInMode(requestUrl);
        const state = randomBytes(32).toString("base64url");
        const verifier = randomBytes(32).toString("base64url");
        const challenge = createHash("sha256").update(verifier).digest("base64url");
        const next = safeSignInNext(requestUrl.searchParams.get("redirect"));

        const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        googleUrl.search = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "openid email profile",
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
          prompt: "select_account",
        }).toString();

        return redirect(googleUrl.toString(), [
          signInCookie(GOOGLE_STATE_COOKIE, state, secure),
          signInCookie(GOOGLE_VERIFIER_COOKIE, verifier, secure),
          signInCookie(GOOGLE_NEXT_COOKIE, encodeURIComponent(next), secure),
          signInCookie(GOOGLE_MODE_COOKIE, mode, secure),
        ]);
      },
    },
  },
});
