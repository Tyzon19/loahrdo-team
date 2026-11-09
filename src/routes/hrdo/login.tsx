import {
  createFileRoute,
  Link,
  redirect as routerRedirect,
  useRouter,
} from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Lock, Pointer, User } from "lucide-react";
import { LoadingScreen } from "@/components/app/LoadingPanel";
import {
  AuthLayout,
  FakeCaptcha,
  Field,
  GoogleButton,
  OrDivider,
  SubmitButton,
} from "@/components/AuthLayout";
import { hrdoLoginFn } from "@/server-functions";
import { SITE, canonical } from "@/lib/site";
import { googleSignInErrorMessage } from "@/lib/google-signin";

type LoginSearch = {
  redirect?: string | undefined;
  error?: string | undefined;
  reset?: "success" | undefined;
};

export const Route = createFileRoute("/hrdo/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const target = search["redirect"];
    const issue = search["error"];
    const redirect =
      typeof target === "string" && target.startsWith("/") && !target.startsWith("//")
        ? target
        : undefined;

    return {
      redirect: redirect && redirect !== "/hrdo/login" ? redirect : undefined,
      error: typeof issue === "string" && /^google_[a-z_]+$/.test(issue) ? issue : undefined,
      reset: search["reset"] === "success" ? "success" : undefined,
    };
  },
  beforeLoad: ({ context, search }) => {
    if (context.hrdoViewer) {
      throw routerRedirect({
        to: context.hrdoViewer.mustChangePassword
          ? "/hrdo/change-password"
          : search.redirect && search.redirect !== "/hrdo/login"
            ? search.redirect
            : "/hrdo/dashboard",
      });
    }
  },
  head: () => ({
    meta: [
      { title: `HRDO sign in — ${SITE.name}` },
      {
        name: "description",
        content: "Sign in to the LOA HRDO COE system with your institutional account.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `HRDO sign in — ${SITE.name}` },
      { property: "og:description", content: "Sign in to the LOA HRDO COE system." },
      { property: "og:url", content: canonical("/hrdo/login") },
    ],
    links: [{ rel: "canonical", href: canonical("/hrdo/login") }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => googleSignInErrorMessage(search.error));
  const googleHref = search.redirect
    ? `/api/auth/google?mode=hrdo&redirect=${encodeURIComponent(search.redirect)}`
    : "/api/auth/google?mode=hrdo";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await hrdoLoginFn({ data: { email, password } });
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }

      await router.invalidate();
      toast.success("Signed in.");
      const target = result.data.mustChangePassword
        ? "/hrdo/change-password"
        : search.redirect && search.redirect !== "/hrdo/login"
          ? search.redirect
          : "/hrdo/dashboard";
      window.location.assign(target);
    } catch {
      setError("We couldn't sign you in. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <>
      {busy && <LoadingScreen label="Signing in to LOA HRDO Desk" mode="overlay" immediate />}

      <AuthLayout title="Sign In">
        <form onSubmit={onSubmit} noValidate>
          {error && (
            <p role="alert" className="mb-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {search.reset === "success" && (
            <p role="status" className="mb-3 text-sm text-success">
              Password updated successfully. Sign in with your new password.
            </p>
          )}

          <Field
            id="hrdoLoginEmail"
            icon={User}
            type="email"
            placeholder="Email address"
            autoComplete="email"
            pattern="[A-Za-z0-9._%+\x2d]+@lyceumalabang[.]edu[.]ph"
            title="Use a valid @lyceumalabang.edu.ph email address."
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Field
            id="hrdoLoginPassword"
            icon={Lock}
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <FakeCaptcha />

          <Link
            to="/hrdo/forgot-password"
            className="mb-2 block text-sm font-medium text-primary hover:underline"
          >
            Forgot Password?
          </Link>
          <SubmitButton icon={Pointer} disabled={busy}>
            {busy ? "Signing in" : "Sign In"}
          </SubmitButton>
          <OrDivider />
          <GoogleButton href={googleHref} label="Continue with institutional Google" />

          <p className="mt-3 text-sm text-muted-foreground">
            Need to return?{" "}
            <Link to="/" className="font-semibold text-primary hover:underline">
              Back to home.
            </Link>
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link
              to="/register"
              search={email.trim() ? { email: email.trim() } : {}}
              className="font-semibold text-primary hover:underline"
            >
              Continue with email.
            </Link>
          </p>
        </form>
      </AuthLayout>
    </>
  );
}
