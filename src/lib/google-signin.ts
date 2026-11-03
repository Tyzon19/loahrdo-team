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
    "Your institutional Google account is valid. The requisitioner profile will be created automatically on first sign-in. Please try again.",
  google_role: "This is not a requisitioner account. Use the HRDO staff sign-in instead.",
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
): GoogleSignInErrorCode | null {
  if (!institutionalEmailAllowed(normaliseEmail(email))) return "google_domain";
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
