import { afterEach, describe, expect, it, vi } from "vitest";
import {
  googleAccountProblem,
  googleSignInErrorMessage,
  safeSignInNext,
} from "@/lib/google-signin";
import { googleSignInRedirectUri } from "@/server/google-signin";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Google sign-in eligibility", () => {
  it("accepts an institutional requisitioner account regardless of case", () => {
    expect(googleAccountProblem("Teacher@LyceumAlabang.edu.ph", "requisitioner")).toBeNull();
  });

  it("refuses personal and non-institutional addresses", () => {
    expect(googleAccountProblem("teacher@gmail.com", "requisitioner")).toBe("google_domain");
    expect(googleAccountProblem("teacher@loa.edu.ph", "requisitioner")).toBe("google_domain");
  });

  it("accepts institutional addresses even when no account record exists yet", () => {
    expect(googleAccountProblem("teacher@lyceumalabang.edu.ph", null)).toBeNull();
  });

  it("refuses staff accounts", () => {
    expect(googleAccountProblem("staff@lyceumalabang.edu.ph", "admin")).toBe("google_role");
    expect(googleAccountProblem("staff@lyceumalabang.edu.ph", "transport_head")).toBe(
      "google_role",
    );
  });
});

describe("Google sign-in redirect target", () => {
  it("keeps only same-site paths", () => {
    expect(safeSignInNext("/requests/123")).toBe("/requests/123");
    expect(safeSignInNext("%2Frequests%2F123")).toBe("/requests/123");
    expect(safeSignInNext("//evil.example")).toBe("/dashboard");
    expect(safeSignInNext("https://evil.example")).toBe("/dashboard");
    expect(safeSignInNext("https%3A%2F%2Fevil.example")).toBe("/dashboard");
    expect(safeSignInNext("/bad%0Apath")).toBe("/dashboard");
    expect(safeSignInNext("")).toBe("/dashboard");
    expect(safeSignInNext(undefined)).toBe("/dashboard");
  });
});

describe("Google sign-in callback URI", () => {
  it("uses the current local origin when SITE_URL points to another local port", () => {
    vi.stubEnv("SITE_URL", "http://localhost:8080");
    vi.stubEnv("GOOGLE_SIGNIN_REDIRECT_URI", "");

    expect(googleSignInRedirectUri(new URL("http://localhost:3000/api/auth/google"))).toBe(
      "http://localhost:3000/api/auth/google/callback",
    );
  });

  it("uses the configured public origin for non-local requests", () => {
    vi.stubEnv("SITE_URL", "https://portal.example.test");
    vi.stubEnv("GOOGLE_SIGNIN_REDIRECT_URI", "");

    expect(googleSignInRedirectUri(new URL("https://portal.example.test/api/auth/google"))).toBe(
      "https://portal.example.test/api/auth/google/callback",
    );
  });
});

describe("Google sign-in messages", () => {
  it("explains each failure code and falls back to a generic message", () => {
    expect(googleSignInErrorMessage("google_domain")).toContain("@lyceumalabang.edu.ph");
    expect(googleSignInErrorMessage("google_no_account")).toContain("created automatically");
    expect(googleSignInErrorMessage("google_role")).toContain("HRDO");
    expect(googleSignInErrorMessage("google_session")).toContain("session expired");
    expect(googleSignInErrorMessage("google_configuration")).toContain("callback URL");
    expect(googleSignInErrorMessage("google_token")).toContain("Google could not complete");
    expect(googleSignInErrorMessage("google_profile")).toContain("account profile");
    expect(googleSignInErrorMessage("google_server")).toContain("app could not finish");
    expect(googleSignInErrorMessage("something_else")).toBe(
      googleSignInErrorMessage("google_failed"),
    );
    expect(googleSignInErrorMessage(null)).toBeNull();
  });
});
