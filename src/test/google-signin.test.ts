import { describe, expect, it } from "vitest";
import {
  googleAccountProblem,
  googleSignInErrorMessage,
  safeSignInNext,
} from "@/lib/google-signin";

describe("Google sign-in eligibility", () => {
  it("accepts an institutional requisitioner account regardless of case", () => {
    expect(googleAccountProblem("Teacher@LyceumAlabang.edu.ph", "requisitioner")).toBeNull();
  });

  it("refuses personal and non-institutional addresses", () => {
    expect(googleAccountProblem("teacher@gmail.com", "requisitioner")).toBe("google_domain");
    expect(googleAccountProblem("teacher@loa.edu.ph", "requisitioner")).toBe("google_domain");
  });

  it("refuses institutional addresses with no account", () => {
    expect(googleAccountProblem("teacher@lyceumalabang.edu.ph", null)).toBe("google_no_account");
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
    expect(safeSignInNext("//evil.example")).toBe("/dashboard");
    expect(safeSignInNext("https://evil.example")).toBe("/dashboard");
    expect(safeSignInNext("")).toBe("/dashboard");
    expect(safeSignInNext(undefined)).toBe("/dashboard");
  });
});

describe("Google sign-in messages", () => {
  it("explains each failure code and falls back to a generic message", () => {
    expect(googleSignInErrorMessage("google_domain")).toContain("@lyceumalabang.edu.ph");
    expect(googleSignInErrorMessage("google_no_account")).toContain("Create an account");
    expect(googleSignInErrorMessage("google_role")).toContain("HRDO");
    expect(googleSignInErrorMessage("something_else")).toBe(
      googleSignInErrorMessage("google_failed"),
    );
    expect(googleSignInErrorMessage(null)).toBeNull();
  });
});
