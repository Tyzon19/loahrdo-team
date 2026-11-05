import { createFileRoute, Link, redirect as routerRedirect } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Building2, Lock, Mail, User, UserPlus } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { LoadingScreen } from "@/components/app/LoadingPanel";
import {
  AuthLayout,
  FakeCaptcha,
  Field,
  GoogleButton,
  OrDivider,
  SubmitButton,
} from "@/components/AuthLayout";
import { institutionalEmailAllowed, registerSchema } from "@/lib/validation";
import { joinFullName } from "@/lib/name";
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
      { title: `Create a requisitioner account | ${SITE.name}` },
      {
        name: "description",
        content:
          "Create a Lyceum of Alabang PFMO requisitioner account using your official institutional email address.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Create a requisitioner account | ${SITE.name}` },
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
  [
    K in
      | "firstName"
      | "middleName"
      | "lastName"
      | "email"
      | "department"
      | "password"
      | "confirm"
      | "code"
  ]?: string | undefined;
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
        window.location.assign("/#main-content");
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

  function resetVerification() {
    setVerificationStarted(false);
    setCode("");
    setErrors({});
    setError(null);
  }

  function fieldError(key: keyof Errors) {
    const message = errors[key];
    return message ? (
      <p className="mb-3 text-sm text-destructive" role="alert">
        {message}
      </p>
    ) : null;
  }

  return (
    <>
      {busy && (
        <LoadingScreen
          label={
            verificationStarted ? "Verifying institutional email" : "Sending verification code"
          }
          mode="overlay"
          immediate
        />
      )}

      <AuthLayout title={verificationStarted ? "Verify Your Email" : "Create Account"} back>
        <form onSubmit={onSubmit} noValidate>
          {error && (
            <p className="mb-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {verificationStarted ? (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                We sent a six-digit code to{" "}
                <span className="font-medium text-foreground">{form.email.trim()}</span>. Enter it
                below to finish creating your account.
              </p>
              <div className="mb-3">
                <label className="mb-2 block text-sm" htmlFor="registration-code">
                  Verification code
                </label>
                <InputOTP
                  id="registration-code"
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                  containerClassName="justify-center"
                  value={code}
                  onChange={(value) => setCode(value)}
                  aria-invalid={Boolean(errors.code)}
                  aria-describedby="registration-code-help"
                >
                  <InputOTPGroup className="gap-1 sm:gap-2">
                    {Array.from({ length: 6 }, (_, index) => (
                      <InputOTPSlot
                        key={index}
                        index={index}
                        className="h-11 w-9 rounded-md border text-base font-medium sm:h-12 sm:w-11"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <p
                  id="registration-code-help"
                  className="mt-2 text-xs leading-relaxed text-muted-foreground"
                >
                  The code expires in 10 minutes. Do not share it with anyone.
                </p>
                {fieldError("code")}
              </div>

              <div className="mt-3">
                <SubmitButton icon={UserPlus} disabled={busy}>
                  {busy ? "Verifying" : "Verify Email"}
                </SubmitButton>
              </div>

              <div className="mt-3 flex items-center justify-between gap-4">
                <button
                  type="button"
                  className="text-sm font-medium text-primary hover:underline disabled:opacity-60"
                  onClick={() => void requestCode()}
                  disabled={busy || resendSeconds > 0}
                >
                  {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend code"}
                </button>
                <button
                  type="button"
                  className="text-sm font-medium text-primary hover:underline disabled:opacity-60"
                  onClick={resetVerification}
                  disabled={busy}
                >
                  Change email
                </button>
              </div>
            </>
          ) : (
            <>
              <Field
                icon={User}
                placeholder="First name"
                autoComplete="given-name"
                required
                value={form.firstName}
                onChange={(event) => set("firstName", event.target.value)}
              />
              {fieldError("firstName")}
              <Field
                icon={User}
                placeholder="Middle name (optional)"
                autoComplete="additional-name"
                value={form.middleName}
                onChange={(event) => set("middleName", event.target.value)}
              />
              <Field
                icon={User}
                placeholder="Last name"
                autoComplete="family-name"
                required
                value={form.lastName}
                onChange={(event) => set("lastName", event.target.value)}
              />
              {fieldError("lastName")}
              <Field
                icon={Mail}
                type="email"
                placeholder="Email address"
                autoComplete="email"
                required
                value={form.email}
                onChange={(event) => set("email", event.target.value)}
              />
              {fieldError("email")}
              <Field
                icon={Building2}
                placeholder="Department or office"
                autoComplete="organization"
                required
                value={form.department}
                onChange={(event) => set("department", event.target.value)}
              />
              {fieldError("department")}
              <Field
                icon={Lock}
                type="password"
                placeholder="Password"
                autoComplete="new-password"
                required
                value={form.password}
                onChange={(event) => set("password", event.target.value)}
              />
              {fieldError("password")}
              <Field
                icon={Lock}
                type="password"
                placeholder="Confirm password"
                autoComplete="new-password"
                required
                value={form.confirm}
                onChange={(event) => set("confirm", event.target.value)}
              />
              {fieldError("confirm")}

              <FakeCaptcha />

              <div className="mt-3">
                <SubmitButton icon={UserPlus} disabled={busy}>
                  {busy ? "Sending code" : "Sign Up"}
                </SubmitButton>
              </div>

              <OrDivider />
              <GoogleButton
                href="/api/auth/google?redirect=%2F%23main-content"
                label="Sign up with your institutional Google account"
              />

              <p className="mt-3 text-xs text-muted-foreground">
                Only verified @lyceumalabang.edu.ph accounts are accepted.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                By creating an account, you agree to our{" "}
                <Link to="/terms-of-service" className="font-semibold text-primary hover:underline">
                  Terms of Service.
                </Link>
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="font-semibold text-primary hover:underline">
                  Sign in.
                </Link>
              </p>
            </>
          )}
        </form>
      </AuthLayout>
    </>
  );
}
