import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Lock, Mail, Send } from "lucide-react";
import InputOTPWithResendTimer from "@/components/shadcn-studio/input-otp/input-otp-04";
import {
  requestHrdoPasswordRecoveryFn,
  resetHrdoPasswordWithRecoveryCodeFn,
} from "@/server-functions";
import { passwordIssues } from "@/lib/validation";
import { AuthLayout, FakeCaptcha, Field, SubmitButton } from "@/components/AuthLayout";

export const Route = createFileRoute("/hrdo/forgot-password")({ component: HrdoForgotPassword });

function HrdoForgotPassword() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await requestHrdoPasswordRecoveryFn({ data: { email } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(true);
      setMessage("If an HRDO account exists for this email, a recovery code has been sent.");
    } catch {
      setError("We couldn't send a recovery code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function reset(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const issues = passwordIssues(newPassword);
    if (issues.length) {
      setError(`Password must contain ${issues.join(", ")}.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await resetHrdoPasswordWithRecoveryCodeFn({
        data: { email, code, newPassword },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.assign("/hrdo/login?reset=success");
    } catch {
      setError("We couldn't update your password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Reset Password" back backTo="/hrdo/login">
      <p className="mb-4 text-sm text-muted-foreground">
        Enter the email address linked to your HRDO account and we&apos;ll send you a code to reset
        your password.
      </p>
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mb-3 text-sm text-success">
          {message}
        </p>
      )}
      {!sent ? (
        <form onSubmit={sendCode}>
          <Field
            icon={Mail}
            type="email"
            name="recovery-email"
            autoComplete="email"
            required
            placeholder="HRDO account email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <FakeCaptcha />
          <SubmitButton icon={Send} disabled={busy}>
            {busy ? "Sending..." : "Send Reset Link"}
          </SubmitButton>
        </form>
      ) : (
        <form onSubmit={reset}>
          <p className="mb-3 text-sm text-muted-foreground">Recovery code sent to {email}.</p>
          <InputOTPWithResendTimer
            value={code}
            onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
            onResend={async () => {
              const result = await requestHrdoPasswordRecoveryFn({ data: { email } });
              if (!result.ok) setError(result.error);
            }}
            disabled={busy}
          />
          <Field
            icon={Lock}
            type="password"
            name="new-password"
            autoComplete="new-password"
            required
            placeholder="New password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <SubmitButton icon={Lock} disabled={busy}>
            {busy ? "Updating..." : "Update Password"}
          </SubmitButton>
        </form>
      )}
      <p className="mt-3 text-sm text-muted-foreground">
        Remember your password?{" "}
        <Link to="/hrdo/login" className="font-semibold text-primary hover:underline">
          Sign in.
        </Link>
      </p>
    </AuthLayout>
  );
}
