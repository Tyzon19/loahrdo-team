import {
  createFileRoute,
  Link,
  redirect as routerRedirect,
  useRouter,
} from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingScreen } from "@/components/app/LoadingPanel";
import { loginFn } from "@/server-functions";
import { SITE, canonical } from "@/lib/site";
import { googleSignInErrorMessage } from "@/lib/google-signin";

type LoginSearch = { redirect?: string | undefined; error?: string | undefined };

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const target = search["redirect"];
    const issue = search["error"];
    return {
      redirect:
        typeof target === "string" && target.startsWith("/") && !target.startsWith("//")
          ? target
          : undefined,
      error: typeof issue === "string" && /^google_[a-z_]+$/.test(issue) ? issue : undefined,
    };
  },
  beforeLoad: ({ context }) => {
    if (context.viewer) {
      throw routerRedirect({
        to: context.viewer.mustChangePassword ? "/change-password" : "/dashboard",
      });
    }
  },
  head: () => ({
    meta: [
      { title: `Sign in — ${SITE.name}` },
      {
        name: "description",
        content:
          "Sign in to the Lyceum of Alabang PFMO vehicle reservation system with your institutional account.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Sign in — ${SITE.name}` },
      { property: "og:description", content: "Sign in to the LOA vehicle reservation system." },
      { property: "og:url", content: canonical("/login") },
    ],
    links: [{ rel: "canonical", href: canonical("/login") }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => googleSignInErrorMessage(search.error));

  const googleHref = search.redirect
    ? `/api/auth/google?redirect=${encodeURIComponent(search.redirect)}`
    : "/api/auth/google";

  function handleAction(action: string) {
    toast.info(`${action} is not enabled yet.`);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await loginFn({ data: { email, password } });
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }

      await router.invalidate();
      toast.success("Signed in.");
      const target = result.data.mustChangePassword
        ? "/change-password"
        : search.redirect && search.redirect !== "/login"
          ? search.redirect
          : "/dashboard";
      window.location.assign(target);
    } catch {
      setError("We couldn't sign you in. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="module-login-shell">
      {busy && <LoadingScreen label="Signing in" mode="overlay" />}

      <section className="module-login-brand" aria-labelledby="brand-heading">
        <div className="module-login-cityscape" aria-hidden="true" />

        <div className="module-login-brand-copy">
          <h1 id="brand-heading">
            Sign in to continue
            <br />
            your vehicle request.
          </h1>

          <p>Reserve a trip, track approvals, and print your official ticket.</p>
        </div>
      </section>

      <section className="module-login-account" aria-labelledby="login-heading">
        <div className="module-login-account-content">
          <div className="module-login-form-logo-wrap">
            <img
              src="/loa-loading.png"
              alt="Lyceum of Alabang home logo"
              className="module-login-form-logo"
            />
          </div>

          <header className="module-login-form-heading">
            <h2 id="login-heading">Sign In</h2>
            <p>Use your official institutional account to continue your vehicle request.</p>
          </header>

          <form className="module-login-form" onSubmit={onSubmit} noValidate>
            {error && (
              <div
                role="alert"
                className="flex gap-2 rounded-sm border border-destructive/40 bg-danger-soft p-4 text-base leading-relaxed"
              >
                <span>{error}</span>
              </div>
            )}

            <div className="module-login-field">
              <label htmlFor="email">Institutional email</label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="name@lyceumalabang.edu.ph"
                pattern="[A-Za-z0-9._%+-]+@lyceumalabang\\.edu\\.ph"
                title="Use a valid @lyceumalabang.edu.ph email address."
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="module-login-field">
              <label htmlFor="password">Password</label>
              <div className="module-login-password-wrap">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />

                <button
                  className="module-login-password-toggle"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    aria-hidden="true"
                  >
                    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="2.5" />
                    {showPassword && <path d="m4 3 16 18" />}
                  </svg>
                </button>
              </div>
            </div>

            <div className="module-login-options">
              <label className="module-login-remember">
                <input
                  type="checkbox"
                  name="remember"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                <span>Remember me for 30 days</span>
              </label>

              <button
                className="module-login-text-button"
                type="button"
                onClick={() => handleAction("Password recovery")}
              >
                Forgot password ?
              </button>
            </div>

            <Button type="submit" className="module-login-submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign In"}
            </Button>
            <Link
              to="/register"
              search={email.trim() ? { email: email.trim() } : undefined}
              className="module-login-text-button mt-2 self-start"
            >
              Continue with email
            </Link>
          </form>

          <div className="module-login-divider">
            <span>or continue with</span>
          </div>

          <div
            className="module-login-social-options"
            role="group"
            aria-label="Other sign-in methods"
          >
            <a
              className="module-login-social-button module-login-social-google"
              href={googleHref}
              aria-label="Continue with your Lyceum Google account"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.59 4.59 0 0 1-2 3.01v2.5h3.23c1.9-1.75 2.99-4.33 2.99-7.34Z"
                />
                <path
                  fill="#34A853"
                  d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.23-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"
                />
                <path
                  fill="#FBBC05"
                  d="M6.41 13.91a6 6 0 0 1 0-3.82V7.5H3.07a10 10 0 0 0 0 9l3.34-2.59Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.97c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.93 5.5l3.34 2.59A6.01 6.01 0 0 1 12 5.97Z"
                />
              </svg>
            </a>
          </div>

          <p className="module-login-signup">
            New here? Create an account! <span aria-hidden="true">→</span>{" "}
            <Link to="/register" className="module-login-text-button">
              Sign up
            </Link>
          </p>

          <p className="module-login-message" role="status" aria-live="polite">
            {error ? "" : "Use your institutional account to continue."}
          </p>
        </div>
      </section>
    </div>
  );
}
