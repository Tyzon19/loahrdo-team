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
  | "google_no_account"
  | "google_role"
  | "google_failed";

const MESSAGES: Record<GoogleSignInErrorCode, string> = {
  google_unavailable:
    "Google sign-in is not set up yet. Use your institutional email and password, or contact the system administrator.",
  google_denied:
    "Google sign-in was cancelled. Try again, or use your institutional email and password.",
  google_domain: `Use your @${INSTITUTIONAL_EMAIL_DOMAIN} Google account. Other accounts cannot sign in here.`,
  google_no_account:
    "No requisitioner account uses this Google address yet. Create an account first, then sign in with Google.",
  google_role: "This is not a requisitioner account. Use the HRDO staff sign-in instead.",
  google_failed: "We couldn't sign you in with Google. Please try again.",
};

export function googleSignInErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return MESSAGES[code as GoogleSignInErrorCode] ?? MESSAGES.google_failed;
}

/** Google sign-in is limited to verified institutional accounts with the requisitioner role. */
export function googleAccountProblem(
  email: string,
  role: Role | null,
): GoogleSignInErrorCode | null {
  if (!institutionalEmailAllowed(normaliseEmail(email))) return "google_domain";
  if (!role) return "google_no_account";
  if (role !== "requisitioner") return "google_role";
  return null;
}

export function safeSignInNext(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}
