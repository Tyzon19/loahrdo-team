import type { Role } from "@/lib/types";
import {
  INSTITUTIONAL_EMAIL_DOMAIN,
  institutionalEmailAllowed,
  normaliseEmail,
} from "@/lib/validation";

export type GoogleSignInErrorCode =
  | "google_unavailable"
  | "google_denied"
  | "google_domain"
  | "google_external_domain"
  | "google_no_account"
  | "google_role"
  | "google_session"
  | "google_configuration"
  | "google_token"
  | "google_profile"
  | "google_server"
  | "google_failed";

const MESSAGES: Record<GoogleSignInErrorCode, string> = {
  google_unavailable:
    "Google sign-in is not set up yet. Use your institutional email and password, or contact the system administrator.",
  google_denied:
    "Google sign-in was cancelled. Try again, or use your institutional email and password.",
  google_domain: `Use your @${INSTITUTIONAL_EMAIL_DOMAIN} Google account. Other accounts cannot sign in here.`,
  google_external_domain:
    "Use a personal Google account. Institutional accounts are for current employees.",
  google_no_account:
    "Your institutional Google account is valid. The requisitioner profile will be created automatically on first sign-in. Please try again.",
  google_role: "This is not a requisitioner account. Use the HRDO staff sign-in instead.",
  google_session:
    "The Google sign-in session expired or could not be verified. Start again from the sign-in page.",
  google_configuration:
    "Google sign-in configuration needs attention. Contact the system administrator and ask them to verify the OAuth client and callback URL.",
  google_token:
    "Google could not complete sign-in. Please start again; if it continues, contact the system administrator.",
  google_profile:
    "Google sign-in completed, but the account profile could not be verified. Try again or contact the system administrator.",
  google_server:
    "Google verified your account, but the app could not finish sign-in. Contact the system administrator.",
  google_failed: "We couldn't sign you in with Google. Please try again.",
};

export function googleSignInErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return MESSAGES[code as GoogleSignInErrorCode] ?? MESSAGES.google_failed;
}

/** Google sign-in is limited to verified institutional accounts. */
export function googleAccountProblem(
  email: string,
  role: Role | null,
  mode: "institutional" | "external" = "institutional",
): GoogleSignInErrorCode | null {
  const isInstitutional = institutionalEmailAllowed(normaliseEmail(email));
  if (mode === "external") return isInstitutional ? "google_external_domain" : null;
  if (!isInstitutional) return "google_domain";
  if (role && role !== "requisitioner") return "google_role";
  return null;
}

export function safeSignInNext(value: string | null | undefined): string {
  if (!value) return "/dashboard";

  let next: string;
  try {
    next = decodeURIComponent(value);
  } catch {
    return "/dashboard";
  }

  const trimmed = next.trim();
  if (
    !trimmed ||
    trimmed.includes("\u0000") ||
    /[\r\n]/.test(trimmed) ||
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//")
  ) {
    return "/dashboard";
  }

  return trimmed;
}

export function requiresProfileCompletion(profileComplete: boolean | number) {
  return !profileComplete;
}

export function hasUserSetPassword(passwordHash: string, placeholderPasswordHash: string) {
  return passwordHash !== placeholderPasswordHash;
}

export function googleSignInDestination(
  account: { needsProfileCompletion: boolean; mustChangePassword: boolean },
  safeNext: string,
) {
  if (account.needsProfileCompletion) {
    return `/complete-profile?redirect=${encodeURIComponent(safeNext)}`;
  }
  if (account.mustChangePassword) return "/change-password";
  return safeNext;
}
