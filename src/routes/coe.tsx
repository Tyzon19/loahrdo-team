import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileBadge, Mail } from "lucide-react";
import { AuthLayout } from "@/components/AuthLayout";
import { HRDO } from "@/lib/hrdo";
import { canonical } from "@/lib/site";

export const Route = createFileRoute("/coe")({
  head: () => ({
    meta: [
      { title: `COE request · ${HRDO.shortName}` },
      {
        name: "description",
        content: "Choose how you want to request a Certificate of Employment or verification.",
      },
      { property: "og:title", content: `COE request · ${HRDO.shortName}` },
      {
        property: "og:description",
        content: "Choose the request path that matches your employment status.",
      },
      { property: "og:url", content: canonical("/coe") },
    ],
    links: [{ rel: "canonical", href: canonical("/coe") }],
  }),
  component: CoeEntryPage,
});

function CoeEntryPage() {
  return (
    <AuthLayout title="COE REQUEST" back backTo="/login" centered showImage={false}>
      <h2 className="mb-2 text-3xl font-bold tracking-tight text-foreground">
        How can we help you today?
      </h2>
      <p className="mb-7 text-base leading-6 text-muted-foreground">
        Pick the option that best describes your request.
      </p>

      <div className="grid gap-4 md:grid-cols-2" aria-label="COE request options">
        <Link
          to="/hrdo/login"
          search={{ redirect: "/hrdo/coe?requestor=internal" }}
          className="group flex min-h-52 w-full touch-manipulation flex-col items-start rounded-xl border border-border bg-background p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/[0.03] hover:shadow-md active:translate-y-0 active:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <FileBadge className="h-8 w-8" aria-hidden />
          </span>
          <span className="mt-5 min-w-0 flex-1">
            <span className="block text-lg font-bold text-foreground">Current employee</span>
            <span className="mt-2 block text-sm leading-6 text-muted-foreground">
              Sign in using your institutional email to request and track your COE.
            </span>
          </span>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
            Continue to HRDO login
            <ArrowRight
              className="h-5 w-5 transition-transform group-hover:translate-x-1"
              aria-hidden
            />
          </span>
        </Link>

        <a
          href="/api/auth/google?mode=external&redirect=%2Fhrdo%2Fcoe"
          className="group flex min-h-52 w-full touch-manipulation flex-col items-start rounded-xl border border-border bg-background p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/[0.03] hover:shadow-md active:translate-y-0 active:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <Mail className="h-8 w-8" aria-hidden />
          </span>
          <span className="mt-5 min-w-0 flex-1">
            <span className="block text-lg font-bold text-foreground">
              Former employee or verifier
            </span>
            <span className="mt-2 block text-sm leading-6 text-muted-foreground">
              No school email? Continue with any personal Gmail or other Google account.
            </span>
          </span>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
            Continue with Gmail
            <ArrowRight
              className="h-5 w-5 transition-transform group-hover:translate-x-1"
              aria-hidden
            />
          </span>
        </a>
      </div>
    </AuthLayout>
  );
}
