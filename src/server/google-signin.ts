import { serverEnvOptional } from "./env";

export const GOOGLE_SIGN_IN_START_PATH = "/api/auth/google";
export const GOOGLE_SIGN_IN_CALLBACK_PATH = "/api/auth/google/callback";
export const GOOGLE_SIGN_IN_COOKIE_PATH = GOOGLE_SIGN_IN_START_PATH;
export const GOOGLE_STATE_COOKIE = "loa_google_state";
export const GOOGLE_VERIFIER_COOKIE = "loa_google_verifier";
export const GOOGLE_NEXT_COOKIE = "loa_google_next";
export const GOOGLE_MODE_COOKIE = "loa_google_mode";

export type GoogleSignInMode = "requisitioner" | "hrdo" | "external";

export function googleSignInMode(requestUrl: URL): GoogleSignInMode {
  const mode = requestUrl.searchParams.get("mode");
  if (mode === "hrdo" || mode === "external") return mode;
  return "requisitioner";
}

export function googleSignInCredentials(mode: GoogleSignInMode = "requisitioner") {
  if (mode === "external") {
    return {
      clientId:
        serverEnvOptional("GOOGLE_EXTERNAL_CLIENT_ID") ?? serverEnvOptional("GOOGLE_CLIENT_ID"),
      clientSecret:
        serverEnvOptional("GOOGLE_EXTERNAL_CLIENT_SECRET") ??
        serverEnvOptional("GOOGLE_CLIENT_SECRET"),
    };
  }
  return {
    clientId: serverEnvOptional("GOOGLE_CLIENT_ID"),
    clientSecret: serverEnvOptional("GOOGLE_CLIENT_SECRET"),
  };
}

/**
 * The redirect URI sent to Google and used for the token exchange. It must be
 * registered on the OAuth client. GOOGLE_SIGNIN_REDIRECT_URI wins; otherwise the
 * public site origin is used for non-local requests. Local requests use their
 * own origin so OAuth state cookies survive when the dev server port differs
 * from SITE_URL.
 */
export function googleSignInRedirectUri(requestUrl: URL): string {
  const configured = serverEnvOptional("GOOGLE_SIGNIN_REDIRECT_URI");
  if (configured) return configured;

  const local = ["localhost", "127.0.0.1"].includes(requestUrl.hostname);
  const site = serverEnvOptional("SITE_URL");
  if (site) {
    try {
      const siteUrl = new URL(site);
      const siteIsLocal = ["localhost", "127.0.0.1"].includes(siteUrl.hostname);
      if (!local && !siteIsLocal) {
        return `${siteUrl.origin}${GOOGLE_SIGN_IN_CALLBACK_PATH}`;
      }
    } catch {
      // Fall through to the request origin when SITE_URL is malformed.
    }
  }
  return `${requestUrl.origin}${GOOGLE_SIGN_IN_CALLBACK_PATH}`;
}

export function signInCookie(name: string, value: string, secure: boolean, maxAge = 600): string {
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=${GOOGLE_SIGN_IN_COOKIE_PATH}; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearedSignInCookie(name: string, secure: boolean): string {
  return `${name}=; HttpOnly; SameSite=Lax; Path=${GOOGLE_SIGN_IN_COOKIE_PATH}; Max-Age=0${secure ? "; Secure" : ""}`;
}
