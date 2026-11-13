import {
  createFileRoute,
  Link,
  redirect as routerRedirect,
  useRouter,
} from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Lock, Pointer, User } from "lucide-react";
import { toast } from "sonner";
import { LoadingScreen } from "@/components/app/LoadingPanel";
import {
  AuthLayout,
  FakeCaptcha,
  Field,
  GoogleButton,
  OrDivider,
  SubmitButton,
} from "@/components/AuthLayout";
import { googleSignInErrorMessage } from "@/lib/google-signin";
import { SITE, canonical } from "@/lib/site";
import { loginFn } from "@/server-functions";

type LoginSearch = {
  redirect?: string;
  error?: string;
  reset?: "success";
};

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const target = search["redirect"];
    const issue = search["error"];
    const reset = search["reset"] === "success" ? "success" : undefined;
    return {
      ...(typeof target === "string" && target.startsWith("/") && !target.startsWith("//")
        ? { redirect: target }
        : {}),
      ...(typeof issue === "string" && /^google_[a-z_]+$/.test(issue) ? { error: issue } : {}),
      ...(reset ? { reset } : {}),
    };
  },
  beforeLoad: ({ context }) => {
    if (context.viewer) {
      throw routerRedirect({
        to: context.viewer.needsProfileCompletion
          ? "/complete-profile"
          : context.viewer.mustChangePassword
            ? "/change-password"
            : "/dashboard",
      });
    }
  },
  head: () => ({
    meta: [
      { title: `Sign in — ${SITE.name}` },
      {
        name: "description",
        content: "Sign in to the Lyceum of Alabang PFMO vehicle reservation system.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Sign in — ${SITE.name}` },
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => googleSignInErrorMessage(search.error));
  const googleHref = search.redirect
    ? `/api/auth/google?redirect=${encodeURIComponent(search.redirect)}`
    : "/api/auth/google";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await loginFn({ data: { email, password } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await router.invalidate();
      toast.success("Signed in.");
      const target = result.data.mustChangePassword
        ? "/change-password"
        : search.redirect && search.redirect !== "/login"
          ? search.redirect
          : "/dashboard";
      await router.navigate({ href: target });
    } catch {
      setError("We couldn't sign you in. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {busy && <LoadingScreen label="Signing in to LOA" mode="overlay" immediate />}

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
            id="loginEmail"
            icon={User}
            type="email"
            placeholder="Email address"
            autoComplete="email"
            pattern="[A-Za-z0-9._%+\-]+@lyceumalabang\.edu\.ph"
            title="Use a valid @lyceumalabang.edu.ph email address."
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Field
            id="loginPassword"
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
            to="/forgot-password"
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
            Don&apos;t have an account?{" "}
            <Link to="/register" className="font-semibold text-primary hover:underline">
              Sign up.
            </Link>
          </p>
        </form>
      </AuthLayout>
    </>
  );
}
