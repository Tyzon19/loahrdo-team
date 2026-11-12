import { createFileRoute, Link, redirect as routerRedirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Lock, Pointer, User } from "lucide-react";
import { AuthLayout, FakeCaptcha, Field, SubmitButton } from "@/components/AuthLayout";
import { LoadingScreen } from "@/components/app/LoadingPanel";
import { SITE, canonical } from "@/lib/site";
import { permissionLoginFn } from "@/server-functions";

type LoginSearch = {
  redirect?: string | undefined;
};

/** Keeps the post-sign-in hop inside the Permission Slip pages. */
function permissionTarget(value: unknown) {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/permission-slips") || value.startsWith("//")) return undefined;
  if (value === "/permission-slips/login") return undefined;
  return value;
}

export const Route = createFileRoute("/permission-slips/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: permissionTarget(search["redirect"]),
  }),
  beforeLoad: ({ context, search }) => {
    if (context.permissionViewer) {
      throw routerRedirect({ to: search.redirect ?? "/permission-slips" });
    }
  },
  head: () => ({
    meta: [
      { title: `Permission Slip sign in — ${SITE.name}` },
      {
        name: "description",
        content: "Sign in to the LOA Permission Slip system with your Permission Slip account.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Permission Slip sign in — ${SITE.name}` },
      { property: "og:url", content: canonical("/permission-slips/login") },
    ],
    links: [{ rel: "canonical", href: canonical("/permission-slips/login") }],
  }),
  component: PermissionLoginPage,
});

function PermissionLoginPage() {
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await permissionLoginFn({ data: { email, password } });
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      window.location.assign(search.redirect ?? "/permission-slips");
    } catch {
      setError("We couldn't sign you in. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <>
      {busy && <LoadingScreen label="Signing in to Permission Slip" mode="overlay" immediate />}

      <AuthLayout title="Permission Slip Sign In">
        <form onSubmit={onSubmit} noValidate>
          {error && (
            <p role="alert" className="mb-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <Field
            id="permissionLoginEmail"
            icon={User}
            type="email"
            placeholder="Email address"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Field
            id="permissionLoginPassword"
            icon={Lock}
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <FakeCaptcha />

          <SubmitButton icon={Pointer} disabled={busy}>
            {busy ? "Signing in" : "Sign In"}
          </SubmitButton>

          <p className="mt-4 text-sm text-muted-foreground">
            Use the same institutional account you use in the other LOA systems. Signed-in users
            without a Permission Slip role can file and track their own slips.{" "}
            <Link to="/register" className="font-semibold text-primary hover:underline">
              Need an account?
            </Link>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <Link to="/" className="font-semibold text-primary hover:underline">
              Back to home
            </Link>
          </p>
        </form>
      </AuthLayout>
    </>
  );
}
