import { createFileRoute, Link, redirect as routerRedirect } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AlertCircle, IdCard, MailCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicShell } from "@/components/marketing/PublicShell";
import { institutionalEmailAllowed, registerSchema } from "@/lib/validation";
import { requestRegistrationOtpFn, verifyRegistrationOtpFn } from "@/server-functions";
import { SITE, canonical } from "@/lib/site";

export const Route = createFileRoute("/register")({
  beforeLoad: ({ context }) => {
    if (context.viewer) throw routerRedirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: `Create a requisitioner account — ${SITE.name}` },
      {
        name: "description",
        content:
          "Create a Lyceum of Alabang PFMO requisitioner account using your official institutional email address.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Create a requisitioner account — ${SITE.name}` },
      {
        property: "og:description",
        content: "Register to file and track school vehicle reservation requests.",
      },
      { property: "og:url", content: canonical("/register") },
    ],
    links: [{ rel: "canonical", href: canonical("/register") }],
  }),
  component: RegisterPage,
});

type Errors = {
  [K in "name" | "email" | "department" | "password" | "confirm" | "code"]?: string | undefined;
};

function RegisterPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    department: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verificationStarted, setVerificationStarted] = useState(false);
  const [code, setCode] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  async function requestCode() {
    setError(null);
    setBusy(true);
    try {
      const result = await requestRegistrationOtpFn({
        data: {
          name: form.name,
          email: form.email,
          department: form.department,
          password: form.password,
        },
      });
      if (!result.ok) {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
        return false;
      }
      setErrors({});
      setVerificationStarted(true);
      setResendSeconds(60);
      toast.success(`Verification code sent to ${form.email.trim()}.`);
      return true;
    } catch {
      setError("We couldn't send the verification code. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (verificationStarted) {
      if (!/^\d{6}$/.test(code)) {
        setErrors({ code: "Enter the six-digit verification code." });
        return;
      }
      setBusy(true);
      try {
        const result = await verifyRegistrationOtpFn({
          data: { email: form.email, code },
        });
        if (!result.ok) {
          setError(result.error);
          setErrors(result.fieldErrors ?? {});
          return;
        }
        toast.success("Email verified. Your account is ready.");
        window.location.assign("/dashboard");
      } catch {
        setError("We couldn't verify the code. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
      return;
    }

    const parsed = registerSchema.safeParse({
      name: form.name,
      email: form.email,
      department: form.department,
      password: form.password,
    });
    const nextErrors: Errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !nextErrors[key as keyof Errors]) {
          nextErrors[key as keyof Errors] = issue.message;
        }
      }
    }
    const validEmail = registerSchema.shape.email.safeParse(form.email);
    if (validEmail.success && !institutionalEmailAllowed(validEmail.data)) {
      nextErrors.email = "Use your official @lyceumalabang.edu.ph email address.";
    }
    if (form.password !== form.confirm) {
      nextErrors.confirm = "The passwords do not match.";
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    await requestCode();
  }

  const fieldError = (key: keyof Errors) =>
    errors[key] ? (
      <p className="mt-1 text-sm text-destructive" role="alert">
        {errors[key]}
      </p>
    ) : null;

  return (
    <PublicShell>
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1fr_32rem] lg:items-center lg:py-16">
        <div className="hidden lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Requisitioner access
          </p>
          <h1 className="mt-3 max-w-lg font-serif text-3xl font-bold leading-tight">
            Create your account, then file your first request.
          </h1>
          <p className="mt-3 max-w-md text-muted-foreground">
            Requisitioner accounts are for Lyceum of Alabang staff who need to book a school
            vehicle. Approver accounts are issued separately by PFMO.
          </p>
          <ul className="mt-7 space-y-4 text-sm leading-relaxed">
            <li className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-2.5">
              <IdCard className="mt-0.5 h-4 w-4 text-primary" aria-hidden />
              <p>
                Use your Lyceum Google Workspace/Gmail account ending in{" "}
                <strong className="whitespace-nowrap">@lyceumalabang.edu.ph</strong> address. Other
                domains and personal @gmail.com accounts are not eligible.
              </p>
            </li>
            <li className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" aria-hidden />
              <p>You will only ever see the requests your own account filed.</p>
            </li>
          </ul>
        </div>

        <div className="panel w-full p-6 sm:p-8">
          <h2 className="font-serif text-2xl font-bold">Create an account</h2>
          <p className="mt-1 text-sm text-muted-foreground">All fields are required.</p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
            {error && (
              <div
                role="alert"
                className="flex gap-2 rounded-sm border border-destructive/40 bg-danger-soft p-3 text-sm"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                <span>{error}</span>
              </div>
            )}

            {!verificationStarted ? (
              <>
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    autoComplete="name"
                    required
                    maxLength={120}
                    className="mt-1"
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                    aria-invalid={Boolean(errors.name)}
                  />
                  {fieldError("name")}
                </div>

                <div>
                  <Label htmlFor="email">Lyceum Gmail / institutional email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={190}
                    className="mt-1"
                    placeholder="name@lyceumalabang.edu.ph"
                    value={form.email}
                    onChange={(event) => set("email", event.target.value)}
                    aria-invalid={Boolean(errors.email)}
                  />
                  {fieldError("email")}
                </div>

                <div>
                  <Label htmlFor="department">Department or office</Label>
                  <Input
                    id="department"
                    autoComplete="organization"
                    required
                    maxLength={190}
                    className="mt-1"
                    value={form.department}
                    onChange={(event) => set("department", event.target.value)}
                    aria-invalid={Boolean(errors.department)}
                  />
                  {fieldError("department")}
                </div>

                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    maxLength={128}
                    className="mt-1"
                    value={form.password}
                    onChange={(event) => set("password", event.target.value)}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby="password-help"
                  />
                  <p id="password-help" className="mt-1 text-xs text-muted-foreground">
                    At least 12 characters, with upper and lower case, a number and a symbol.
                  </p>
                  {fieldError("password")}
                </div>

                <div>
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    maxLength={128}
                    className="mt-1"
                    value={form.confirm}
                    onChange={(event) => set("confirm", event.target.value)}
                    aria-invalid={Boolean(errors.confirm)}
                  />
                  {fieldError("confirm")}
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={busy}>
                  {busy ? "Sending verification code…" : "Send verification code"}
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="rounded-sm border border-primary/30 bg-info-soft p-4">
                  <div className="flex items-start gap-3">
                    <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <div>
                      <p className="font-semibold">Check your institutional inbox</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Enter the six-digit code sent to <strong>{form.email.trim()}</strong>. It
                        expires in 10 minutes.
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="registration-code">Verification code</Label>
                  <Input
                    id="registration-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    className="mt-1 text-center text-xl tracking-[0.35em]"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    aria-invalid={Boolean(errors.code)}
                    aria-describedby="registration-code-help"
                  />
                  <p id="registration-code-help" className="mt-1 text-xs text-muted-foreground">
                    For your security, do not share this code with anyone.
                  </p>
                  {fieldError("code")}
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={busy}>
                  {busy ? "Verifying…" : "Verify email and create account"}
                </Button>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void requestCode()}
                    disabled={busy || resendSeconds > 0}
                  >
                    {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend code"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setVerificationStarted(false);
                      setCode("");
                      setErrors({});
                      setError(null);
                    }}
                    disabled={busy}
                  >
                    Edit registration details
                  </Button>
                </div>
              </div>
            )}
          </form>

          <p className="mt-4 text-sm text-muted-foreground">
            Already registered?{" "}
            <Link to="/login" className="text-primary underline">
              Sign in
            </Link>
            .
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            By creating an account you agree to the{" "}
            <Link to="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
