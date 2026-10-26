import {
  createFileRoute,
  Link,
  redirect as routerRedirect,
  useRouter,
} from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AlertCircle, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicShell } from "@/components/marketing/PublicShell";
import { LoadingScreen } from "@/components/app/LoadingPanel";
import { loginFn } from "@/server-functions";
import { SITE, canonical } from "@/lib/site";

type LoginSearch = { redirect?: string | undefined };

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const target = search["redirect"];
    return {
      redirect:
        typeof target === "string" && target.startsWith("/") && !target.startsWith("//")
          ? target
          : undefined,
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    <PublicShell>
      {busy && <LoadingScreen label="Signing in" mode="overlay" />}
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:gap-10 sm:py-12 lg:grid-cols-[1fr_32rem] lg:items-center lg:py-20">
        <div className="hidden lg:block">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            {SITE.institution} · PFMO
          </p>
          <h1 className="mt-3 max-w-lg font-serif text-4xl font-bold leading-tight">
            Sign in to continue your vehicle request.
          </h1>
          <p className="mt-3 max-w-md text-lg leading-relaxed text-muted-foreground">
            Each approver uses their own account. Requisitioners only see the requests they filed.
          </p>
          <ul className="mt-7 space-y-4 text-base leading-relaxed">
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden />
              Your session is automatically secured and expires for your protection.
            </li>
            <li className="flex items-start gap-2.5">
              <Lock className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden />
              Too many unsuccessful sign-in attempts may temporarily lock your account.
            </li>
          </ul>
        </div>
        <div className="panel mx-auto w-full max-w-[34rem] p-5 sm:p-8 lg:p-9">
          <h2 className="font-serif text-3xl font-bold sm:text-4xl">Sign in</h2>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground sm:text-lg">
            Use your official institutional email address.
          </p>

          <form className="mt-7 space-y-5 sm:mt-8 sm:space-y-6" onSubmit={onSubmit} noValidate>
            {error && (
              <div
                role="alert"
                className="flex gap-2 rounded-sm border border-destructive/40 bg-danger-soft p-4 text-base leading-relaxed"
              >
                <AlertCircle className="mt-1 h-5 w-5 shrink-0 text-destructive" aria-hidden />
                <span>{error}</span>
              </div>
            )}
            <div>
              <Label htmlFor="email" className="text-base font-semibold sm:text-lg">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                maxLength={190}
                className="mt-2 h-12 px-4 text-base sm:h-14 sm:text-lg"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-base font-semibold sm:text-lg">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={200}
                className="mt-2 h-12 px-4 text-base sm:h-14 sm:text-lg"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              className="h-12 w-full text-base font-semibold sm:h-14 sm:text-lg"
              size="lg"
              disabled={busy}
            >
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
            New requisitioner?{" "}
            <Link to="/register" className="font-medium text-primary underline underline-offset-2">
              Create an account
            </Link>
            .
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            For account access assistance, please contact ITM.{" "}
            <a href={`mailto:${SITE.contactEmail}`} className="underline">
              {SITE.contactEmail}
            </a>{" "}
            if you cannot sign in.
          </p>
        </div>
      </div>
    </PublicShell>
  );
}