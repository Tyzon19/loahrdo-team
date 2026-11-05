import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import InputOTPWithResendTimer from "@/components/shadcn-studio/input-otp/input-otp-04";
import { requestHrdoPasswordRecoveryFn, resetHrdoPasswordWithRecoveryCodeFn } from "@/server-functions";
import { passwordIssues } from "@/lib/validation";

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
    setBusy(true); setError(""); setMessage("");
    const result = await requestHrdoPasswordRecoveryFn({ data: { email } });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setSent(true);
    setMessage("If an HRDO account exists for this email, a recovery code has been sent.");
  }

  async function reset(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const issues = passwordIssues(newPassword);
    if (issues.length) { setError(`Password must contain ${issues.join(", ")}.`); return; }
    setBusy(true); setError("");
    const result = await resetHrdoPasswordWithRecoveryCodeFn({ data: { email, code, newPassword } });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    window.location.assign("/hrdo/login?reset=success");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold">Recover HRDO password</h1>
        <p className="mt-2 text-sm text-muted-foreground">Use your HRDO account email to receive a six-digit code.</p>
        {error && <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {message && <p className="mt-4 rounded-md bg-success/10 p-3 text-sm text-success">{message}</p>}
        {!sent ? (
          <form onSubmit={sendCode} className="mt-6 space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">
              HRDO account email
              <Input
                type="email"
                name="recovery-email"
                autoComplete="email"
                required
                placeholder="name@lyceumalabang.edu.ph"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <Button className="w-full" disabled={busy}>{busy ? "Sending…" : "Send recovery code"}</Button>
          </form>
        ) : (
          <form onSubmit={reset} className="mt-6 space-y-4">
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Recovery email</span>
              <p className="mt-0.5 font-medium">{email}</p>
            </div>
            <InputOTPWithResendTimer
              value={code}
              onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
              onResend={async () => {
                const result = await requestHrdoPasswordRecoveryFn({ data: { email } });
                if (!result.ok) setError(result.error);
              }}
              disabled={busy}
            />
            <label className="block space-y-1.5 text-sm font-medium">
              New password
              <Input
                type="password"
                name="new-password"
                autoComplete="new-password"
                required
                placeholder="Enter your new password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <Button className="w-full" disabled={busy}>{busy ? "Updating…" : "Update password"}</Button>
          </form>
        )}
        <Link to="/hrdo/login" className="mt-6 inline-block text-sm text-primary underline-offset-4 hover:underline">Back to HRDO sign in</Link>
      </section>
    </main>
  );
}
