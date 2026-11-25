import { useState, type FormEvent } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Lock, User } from "lucide-react";
import { AuthLayout, Field, GoogleButton, OrDivider, SubmitButton } from "@/components/AuthLayout";
import {
  ATTENDANCE_SYSTEM,
  attendanceDestination,
  safeAttendanceTarget,
} from "@/lib/attendance-access";
import { googleSignInErrorMessage } from "@/lib/google-signin";
import { attendanceLoginFn } from "@/server-functions";
import { unwrap } from "@/lib/api";

export const Route = createFileRoute("/leaves/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeAttendanceTarget(search["redirect"]),
    error: typeof search["error"] === "string" ? search["error"] : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    if (context.attendanceViewer)
      throw redirect({ href: attendanceDestination(context.attendanceViewer, search.redirect) });
  },
  head: () => ({
    meta: [
      { title: `Sign in | ${ATTENDANCE_SYSTEM}` },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Sign in to the Lyceum of Alabang Leave & Attendance portal.",
      },
      { property: "og:title", content: ATTENDANCE_SYSTEM },
    ],
  }),
  component: AttendanceLoginPage,
});

function AttendanceLoginPage() {
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    search.error === "google_role"
      ? "This account cannot access Leave & Attendance."
      : googleSignInErrorMessage(search.error),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await unwrap(
        attendanceLoginFn({ data: { email, password, redirect: search.redirect } }),
      );
      window.location.assign(result.destination);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to sign in.");
      setBusy(false);
    }
  }
  return (
    <AuthLayout title="Leave & Attendance Sign In">
      <p className="mb-5 text-sm text-muted-foreground">
        Access your HRDO leave balances, attendance history and incident responses.
      </p>
      <form onSubmit={(e) => void submit(e)}>
        {error && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <Field
          id="attendance-email"
          icon={User}
          type="email"
          placeholder="Institutional email address"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          id="attendance-password"
          icon={Lock}
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <SubmitButton icon={Lock} disabled={busy}>
          {busy ? "Signing in…" : "Sign in to Attendance"}
        </SubmitButton>
      </form>
      <OrDivider />
      <GoogleButton
        href={`/api/auth/google?mode=attendance&redirect=${encodeURIComponent(search.redirect)}`}
        label="Continue with institutional Google"
      />
      <p className="mt-4 text-sm text-muted-foreground">
        Use institutional Google for first-time access. Contact HRDO for account or password
        assistance.
      </p>
    </AuthLayout>
  );
}
