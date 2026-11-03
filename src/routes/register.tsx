import { createFileRoute, Link, redirect as routerRedirect } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  IdCard,
  KeyRound,
  MailCheck,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ButtonLoading } from "@/components/app/LoadingPanel";
import { institutionalEmailAllowed, registerSchema } from "@/lib/validation";
import { joinFullName, splitFullName } from "@/lib/name";
import { requestRegistrationOtpFn, verifyRegistrationOtpFn } from "@/server-functions";
import { SITE, canonical } from "@/lib/site";
type RegisterSearch = {
  email?: string | undefined;
};

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>): RegisterSearch => ({
    email:
      typeof search["email"] === "string" && search["email"].trim().length > 0
        ? search["email"].trim()
        : undefined,
  }),
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
  [K in "firstName" | "middleName" | "lastName" | "email" | "department" | "password" | "confirm" | "code"]?: string | undefined;
};

function RegisterPage() {
  const search = Route.useSearch();
  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    email: search.email ?? "",
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

  const fullName = joinFullName({
    firstName: form.firstName,
    middleName: form.middleName,
    lastName: form.lastName,
  });

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
          name: fullName,
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

    const nextErrors: Errors = {};
    if (!form.firstName.trim()) {
      nextErrors.firstName = "Enter your first name.";
    }
    if (!form.lastName.trim()) {
      nextErrors.lastName = "Enter last name.";
    }
    if (!fullName) {
      nextErrors.firstName = nextErrors.firstName ?? "Enter your full name.";
    }

    const parsed = registerSchema.safeParse({
      name: fullName,
      email: form.email,
      department: form.department,
      password: form.password,
    });
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
    <div className="module-login-shell module-register-shell">
      <section className="module-login-brand" aria-labelledby="register-brand-heading">
        <div className="module-login-cityscape" aria-hidden="true" />
        <div className="module-login-brand-copy">
          <h1 id="register-brand-heading">
            Create your account
            <br />
            to get started.
          </h1>
          <p>Register with your institutional account to submit and track vehicle requests.</p>
        </div>
      </section>

      <section className="module-login-account module-register-account" aria-labelledby="register-heading">
        <div className="module-login-account-content">
          <div className="module-login-form-logo-wrap">
            <img
              src="/loa-loading.png"
              alt="Lyceum of Alabang home logo"
              className="module-login-form-logo"
            />
          </div>
          <header className="module-login-form-heading">
            <h2 id="register-heading">Create New Account</h2>
            <p>Use your official institutional account to register.</p>
          </header>

          <form className="module-login-form register-form" onSubmit={onSubmit} noValidate>
              {error && (
                <div
                  role="alert"
                  className="flex gap-2 rounded-sm border border-destructive/40 bg-danger-soft p-3 text-sm"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                  <span>{error}</span>
                </div>
              )}

              {verificationStarted ? (
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

                  <div className="module-login-field">
                    <Label htmlFor="registration-code">Verification code</Label>
                    <Input
                      id="registration-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      className="h-14 text-center text-2xl font-semibold tracking-[0.55em]"
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      aria-invalid={Boolean(errors.code)}
                      aria-describedby="registration-code-help"
                    />
                    <p
                      id="registration-code-help"
                      className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground"
                    >
                      <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      For your security, never share this code. It expires in 10 minutes.
                    </p>
                    {fieldError("code")}
                  </div>

                  <div className="register-action-row register-action-row--stacked">
                    <Button type="submit" className="register-submit-button" disabled={busy}>
                      {busy ? <ButtonLoading label="Verifying…" /> : "REGISTER"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="register-cancel-button"
                      onClick={() => {
                        setVerificationStarted(false);
                        setCode("");
                        setErrors({});
                        setError(null);
                      }}
                      disabled={busy}
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden />
                      CANCEL
                    </Button>
                  </div>

                  <div className="register-extra-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void requestCode()}
                      disabled={busy || resendSeconds > 0}
                    >
                      {resendSeconds > 0
                        ? `Resend code in ${resendSeconds}s`
                        : "Didn't get a code? Resend"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="register-grid">
                    <div className="module-login-field">
                      <Label htmlFor="first-name">First Name</Label>
                      <Input
                        id="first-name"
                        autoComplete="given-name"
                        required
                        maxLength={60}
                        value={form.firstName}
                        onChange={(event) => set("firstName", event.target.value)}
                        aria-invalid={Boolean(errors.firstName)}
                      />
                      {fieldError("firstName")}
                    </div>

                    <div className="module-login-field">
                      <Label htmlFor="middle-name">Middle Name (Optional)</Label>
                      <Input
                        id="middle-name"
                        autoComplete="additional-name"
                        maxLength={60}
                        value={form.middleName}
                        onChange={(event) => set("middleName", event.target.value)}
                        aria-invalid={Boolean(errors.middleName)}
                      />
                      {fieldError("middleName")}
                    </div>

                    <div className="module-login-field">
                      <Label htmlFor="last-name">Last Name</Label>
                      <Input
                        id="last-name"
                        autoComplete="family-name"
                        required
                        maxLength={60}
                        value={form.lastName}
                        onChange={(event) => set("lastName", event.target.value)}
                        aria-invalid={Boolean(errors.lastName)}
                      />
                      {fieldError("lastName")}
                    </div>

                    <div className="module-login-field">
                      <Label htmlFor="email">Institutional Email</Label>
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={190}
                        placeholder="name@lyceumalabang.edu.ph"
                        value={form.email}
                        onChange={(event) => set("email", event.target.value)}
                        aria-invalid={Boolean(errors.email)}
                      />
                      {fieldError("email")}
                    </div>

                    <div className="module-login-field module-login-field--full">
                      <Label htmlFor="department">Department or Office</Label>
                      <Input
                        id="department"
                        autoComplete="organization"
                        required
                        maxLength={190}
                        value={form.department}
                        onChange={(event) => set("department", event.target.value)}
                        aria-invalid={Boolean(errors.department)}
                      />
                      {fieldError("department")}
                    </div>

                    <div className="module-login-field">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        required
                        maxLength={128}
                        value={form.password}
                        onChange={(event) => set("password", event.target.value)}
                        aria-invalid={Boolean(errors.password)}
                        aria-describedby="password-help"
                      />
                      <p id="password-help" className="mt-1 text-[11px] text-muted-foreground">
                        At least 12 characters, with upper and lower case, a number and a symbol.
                      </p>
                      {fieldError("password")}
                    </div>

                    <div className="module-login-field">
                      <Label htmlFor="confirm">Confirm Password</Label>
                      <Input
                        id="confirm"
                        type="password"
                        autoComplete="new-password"
                        required
                        maxLength={128}
                        value={form.confirm}
                        onChange={(event) => set("confirm", event.target.value)}
                        aria-invalid={Boolean(errors.confirm)}
                      />
                      {fieldError("confirm")}
                    </div>
                  </div>

                  <div className="register-action-row">
                    <Button type="submit" className="register-submit-button" disabled={busy}>
                      {busy ? <ButtonLoading label="Sending verification code…" /> : "REGISTER"}
                    </Button>
                    <Link to="/login" className="register-cancel-button" aria-label="Cancel registration">
                      CANCEL
                    </Link>
                  </div>
                </>
              )}
            </form>
        </div>
      </section>
    </div>
  );
}
