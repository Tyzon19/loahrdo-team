import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ClipboardCheck,
  FilePlus2,
  Lock,
  Mail,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicShell } from "@/components/marketing/PublicShell";
import { SITE, canonical } from "@/lib/site";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${SITE.name} — ${SITE.institution} PFMO` },
      {
        name: "description",
        content:
          "Reserve a Lyceum of Alabang school vehicle online, follow the three approval stages, and print the official trip ticket.",
      },
      { property: "og:title", content: `${SITE.name} — ${SITE.institution} PFMO` },
      {
        property: "og:description",
        content:
          "Reserve a Lyceum of Alabang school vehicle online, follow the three approval stages, and print the official trip ticket.",
      },
      { property: "og:url", content: canonical("/") },
      { property: "og:image", content: `${SITE.url}${SITE.ogImage}` },
      { property: "og:image:alt", content: SITE.ogImageAlt },
    ],
    links: [{ rel: "canonical", href: canonical("/") }],
  }),
  component: Landing,
});

const STEPS = [
  {
    icon: FilePlus2,
    title: "Submit your request",
    body: "Sign in with your official LOA account and enter the destination, passengers, dates and purpose.",
  },
  {
    icon: ClipboardCheck,
    title: "Three fixed approvals",
    body: "Transport Services reviews, the Director recommends, and the President grants final approval — in that order.",
  },
  {
    icon: Printer,
    title: "Receive the trip ticket",
    body: "After final approval, the official trip ticket is sent to your notifications or email.",
  },
];

function Landing() {
  const { viewer } = Route.useRouteContext();
  const signedIn = Boolean(viewer);

  return (
    <PublicShell signedIn={signedIn}>
      <section className="border-b bg-gradient-to-b from-info-soft via-background to-background">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 lg:min-h-[calc(100svh-4rem)] lg:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {SITE.institution} · {SITE.office}
            </p>
            <h1 className="mt-4 max-w-2xl font-serif text-4xl font-bold leading-[1.1] text-foreground sm:text-5xl">
              Lyceum of Alabang Vehicle Reservation
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground">
              Reserve a school vehicle for official travel. Your request goes through the three
              approvals, and the approved trip ticket is sent to your notifications.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {signedIn ? (
                <Button asChild size="lg">
                  <Link to="/dashboard">
                    Open your dashboard <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              ) : (
                <>
                  <Button asChild size="lg">
                    <Link to="/register">
                      Request a vehicle <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link to="/login">Sign in to your account</Link>
                  </Button>
                </>
              )}
            </div>
            <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Institutional sign-in required. Requisitioners can only see their own requests.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16" aria-labelledby="how-it-works">
        <div className="max-w-2xl">
          <h2 id="how-it-works" className="font-serif text-2xl font-bold sm:text-3xl">
            How it works
          </h2>
          <p className="mt-2 text-muted-foreground">
            The approval order is fixed, so every reservation follows the same accountable path.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <article key={step.title} className="panel p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <step.icon className="h-4 w-4" aria-hidden />
                Step {index + 1}
              </div>
              <h3 className="mt-3 text-base font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y bg-card" aria-labelledby="why-it-matters">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 lg:grid-cols-2">
          <div>
            <h2 id="why-it-matters" className="font-serif text-2xl font-bold sm:text-3xl">
              Built for accountable school travel
            </h2>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Every decision is recorded with the signer, timestamp and reason, so the office can
              answer questions about any trip without searching through paper forms.
            </p>
          </div>
          <ul className="grid gap-3">
            {[
              {
                icon: ShieldCheck,
                title: "One account per person",
                body: "Approvers sign in with their own account. Nobody can act for someone else.",
              },
              {
                icon: Lock,
                title: "Requests stay private",
                body: "Requisitioners only see their own submissions; staff access is role-based.",
              },
              {
                icon: ClipboardCheck,
                title: "A complete audit trail",
                body: "Submissions, signatures, returns and re-submissions are kept per attempt.",
              },
            ].map((item) => (
              <li key={item.title} className="flex gap-3 rounded-sm border bg-background p-4">
                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-y bg-card" aria-labelledby="contact-us">
        <div className="mx-auto w-full max-w-6xl px-4 py-12">
          <h2 id="contact-us" className="font-serif text-2xl font-bold sm:text-3xl">
            Contact ITM
          </h2>
          <p className="mt-2 text-muted-foreground">
            For questions about your request or trip ticket, reach the Information Technology Management
            Office.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            <li className="flex gap-3 rounded-sm border bg-background p-4">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="font-medium">Official email</p>
                <a
                  href={`mailto:${SITE.contactEmail}`}
                  className="text-sm text-primary hover:underline"
                >
                  {SITE.contactEmail}
                </a>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="rounded-sm border border-primary/20 bg-info-soft p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <h2 className="font-serif text-xl font-bold sm:text-2xl">Ready to file a request?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use your official @lyceumalabang.edu.ph email address to create a requisitioner
              account.
            </p>
          </div>
          <div className="mt-4 flex shrink-0 gap-2 sm:mt-0">
            <Button asChild>
              <Link to={signedIn ? "/dashboard" : "/register"}>
                {signedIn ? "Open dashboard" : "Create an account"}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/privacy">Privacy</Link>
            </Button>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
