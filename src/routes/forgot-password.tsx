import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Lock, Mail, Send } from "lucide-react";
import InputOTPWithResendTimer from "@/components/shadcn-studio/input-otp/input-otp-04";
import { requestPasswordRecoveryFn, resetPasswordWithRecoveryCodeFn } from "@/server-functions";
import { passwordIssues } from "@/lib/validation";
import { AuthLayout, FakeCaptcha, Field, SubmitButton } from "@/components/AuthLayout";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await requestPasswordRecoveryFn({ data: { email } });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
    setMessage("If an account exists for this email, a recovery code has been sent.");
  }

  async function reset(event: FormEvent) {
    event.preventDefault();
    const issues = passwordIssues(newPassword);
    if (issues.length) {
      setError(`Password must contain ${issues.join(", ")}.`);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await resetPasswordWithRecoveryCodeFn({ data: { email, code, newPassword } });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.location.assign("/login?reset=success");
  }

  return (
    <AuthLayout title="Reset Password" back>
      <p className="mb-4 text-sm text-muted-foreground">
        Enter the email address linked to your account and we&apos;ll send you a code to reset your
        password.
      </p>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      {message && <p className="mb-3 text-sm text-success">{message}</p>}
      {!sent ? (
        <form onSubmit={requestCode}>
          <Field
            icon={Mail}
            type="email"
            name="recovery-email"
            required
            autoComplete="email"
            placeholder="Email address"
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
              const result = await requestPasswordRecoveryFn({ data: { email } });
              if (!result.ok) setError(result.error);
            }}
            disabled={busy}
          />
          <Field
            icon={Lock}
            type="password"
            name="new-password"
            required
            autoComplete="new-password"
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
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Sign in.
        </Link>
      </p>
    </AuthLayout>
  );
}
