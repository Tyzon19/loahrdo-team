import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route as callbackRoute } from "@/routes/api.auth.google.callback";
import { Route as startRoute } from "@/routes/api.auth.google";
import { createAttendanceSession, ensureAttendanceGoogleAccount } from "@/server/attendance-auth";
import { attendanceOnlyEmail } from "@/server/account-scope";
import { googleSignInMode } from "@/server/google-signin";

vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@/server/attendance-auth", () => ({
  createAttendanceSession: vi.fn(),
  ensureAttendanceGoogleAccount: vi.fn(),
  ATTENDANCE_SESSION_COOKIE: "loa_attendance_session",
}));
vi.mock("@/server/account-scope", () => ({ attendanceOnlyEmail: vi.fn() }));
type ServerRoute = {
  server: { handlers: { GET: (context: { request: Request }) => Promise<Response> } };
};
const callback = (callbackRoute as unknown as ServerRoute).server.handlers.GET;
const start = (startRoute as unknown as ServerRoute).server.handlers.GET;

describe("Attendance OAuth session boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("GOOGLE_SIGNIN_REDIRECT_URI", "http://localhost:8080/api/auth/google/callback");
    vi.mocked(attendanceOnlyEmail).mockResolvedValue(true);
    vi.mocked(ensureAttendanceGoogleAccount).mockResolvedValue(
      "00000000-0000-4000-8000-000000000001",
    );
    vi.mocked(createAttendanceSession).mockResolvedValue({
      token: "a".repeat(43),
      maxAge: 28800,
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Employee",
        email: "employee@lyceumalabang.edu.ph",
        department: "College",
        role: "EMPLOYEE",
        accountRole: "requisitioner",
        hrdoUserId: null,
        mustChangePassword: false,
        needsProfileCompletion: false,
        canChangePassword: false,
      },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: "test-access-token" }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              email: "employee@lyceumalabang.edu.ph",
              email_verified: true,
              name: "Employee",
            }),
            { status: 200 },
          ),
        ),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function request(mode: string, target = "/leaves") {
    return new Request("http://localhost:8080/api/auth/google/callback?state=state&code=code", {
      headers: {
        cookie: `loa_google_state=state; loa_google_verifier=verifier; loa_google_mode=${mode}; loa_google_next=${encodeURIComponent(target)}`,
      },
    });
  }
  it("recognizes an explicit attendance mode and contains the start redirect", async () => {
    expect(googleSignInMode(new URL("http://localhost:8080/api/auth/google?mode=attendance"))).toBe(
      "attendance",
    );
    const result = await start({
      request: new Request(
        "http://localhost:8080/api/auth/google?mode=attendance&redirect=%2Frequests",
      ),
    });
    expect(result.status).toBe(302);
    expect(result.headers.get("location")).toContain("accounts.google.com");
    expect(result.headers.get("set-cookie")).toContain("loa_google_mode=attendance");
    expect(result.headers.get("set-cookie")).toContain("loa_google_next=%2Fleaves");
  });
  it("creates only the attendance cookie and ignores other-system redirect targets", async () => {
    const result = await callback({ request: request("attendance", "/requests") });
    expect(result.headers.get("location")).toBe("/leaves");
    expect(result.headers.get("set-cookie")).toContain("loa_attendance_session=");
    expect(result.headers.get("set-cookie")).not.toMatch(
      /(?:^|,\s*)loa_(?:session|hrdo_session|permission_session)=/,
    );
    expect(ensureAttendanceGoogleAccount).toHaveBeenCalledWith(
      "employee@lyceumalabang.edu.ph",
      "Employee",
    );
    expect(attendanceOnlyEmail).not.toHaveBeenCalled();
  });
  it("returns attendance failures to the attendance login", async () => {
    const result = await callback({
      request: new Request("http://localhost:8080/api/auth/google/callback?error=access_denied", {
        headers: { cookie: "loa_google_mode=attendance" },
      }),
    });
    expect(result.headers.get("location")).toMatch(/^\/leaves\/login\?error=/);
    expect(createAttendanceSession).not.toHaveBeenCalled();
  });
  it("blocks an attendance-only account from using the shared OAuth callback for VHTT", async () => {
    const result = await callback({ request: request("requisitioner") });
    expect(result.headers.get("location")).toBe("/login?error=google_role");
    expect(createAttendanceSession).not.toHaveBeenCalled();
    expect(result.headers.get("set-cookie")).not.toContain("loa_session=");
  });
});
