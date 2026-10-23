import { createFileRoute, Link } from "@tanstack/react-router";
import { Cookie, Lock, UserCheck } from "lucide-react";
import { PublicShell } from "@/components/marketing/PublicShell";
import { Button } from "@/components/ui/button";
import { resetAnalyticsConsent } from "@/lib/consent";
import { SITE, canonical } from "@/lib/site";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: `Privacy Policy — ${SITE.name}` },
      {
        name: "description",
        content:
          "How the Lyceum of Alabang PFMO vehicle reservation system collects, uses and protects account, request and analytics information.",
      },
      { property: "og:title", content: `Privacy Policy — ${SITE.name}` },
      {
        property: "og:description",
        content:
          "How the Lyceum of Alabang PFMO vehicle reservation system handles your information.",
      },
      { property: "og:url", content: canonical("/privacy") },
      { property: "og:image", content: `${SITE.url}${SITE.ogImage}` },
      { property: "og:image:alt", content: SITE.ogImageAlt },
    ],
    links: [{ rel: "canonical", href: canonical("/privacy") }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PublicShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {SITE.institution} · {SITE.office}
        </p>
        <h1 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 23 October 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="font-serif text-xl font-semibold">Who we are</h2>
            <p className="mt-2 text-muted-foreground">
              This system is operated by the {SITE.office} of {SITE.institution} to manage school
              vehicle reservations, approvals and trip tickets. Questions about this policy or your
              data can be sent to{" "}
              <a href={`mailto:${SITE.contactEmail}`} className="text-primary underline">
                {SITE.contactEmail}
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">Information we collect</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Account details:</strong> your name, official
                email address, department or office, role, and a salted password hash. We never
                store your password in readable form.
              </li>
              <li>
                <strong className="text-foreground">Request details:</strong> destinations, travel
                dates and times, passenger counts, purpose, vehicle assignments, signatures,
                remarks, returns and approval history.
              </li>
              <li>
                <strong className="text-foreground">In-app notifications:</strong> alerts addressed
                to your account when a request needs your attention.
              </li>
              <li>
                <strong className="text-foreground">Technical logs:</strong> session records,
                timestamps and aggregate page-view counts. We do not store your IP address in the
                analytics table, and we never store query strings there.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">Why we use it</h2>
            <p className="mt-2 text-muted-foreground">
              We use this information to authenticate accounts, route requests through the fixed
              three-stage approval order, produce the official trip ticket, keep an audit trail,
              prevent misuse, and improve the service. We do not sell personal information or use it
              for advertising.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">Who can see a request</h2>
            <div className="mt-2 space-y-2 text-muted-foreground">
              <p className="flex gap-2">
                <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                A requisitioner can only see requests filed by their own account.
              </p>
              <p className="flex gap-2">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                Approvers and authorized Transport Services staff can see requests because their
                role requires it. Every server request re-checks your session and role; hiding a
                button in the browser is never treated as protection.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">Cookies and analytics</h2>
            <p className="mt-2 flex gap-2 text-muted-foreground">
              <Cookie className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>
                A strictly necessary session cookie keeps you signed in. It is httpOnly,
                SameSite=Lax, and expires automatically. Optional analytics is off by default and
                starts only after you choose <strong>Accept analytics</strong>. If you accept, we use
                Google Analytics 4 with IP anonymization and a cookie-free first-party page-view
                count. You can withdraw consent at any time with the button below; no analytics runs
                while consent is declined.
              </span>
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                resetAnalyticsConsent();
                window.location.reload();
              }}
            >
              Change or withdraw analytics consent
            </Button>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">How long we keep it</h2>
            <p className="mt-2 text-muted-foreground">
              Request, signature and approval records are retained as part of the office&apos;s
              administrative record for the period required by the institution. Sessions expire
              automatically and expired sessions are removed. Aggregate analytics counts are kept for
              service improvement and do not identify you.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">How we protect it</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>Passwords are hashed with salted scrypt; sessions use random tokens stored only as hashes.</li>
              <li>Database credentials stay in server-side configuration and are never sent to the browser.</li>
              <li>The application uses a dedicated database account limited to the operations it needs.</li>
              <li>All database queries are parameterized to prevent SQL injection.</li>
              <li>Every page and server action validates input and re-checks the signed-in role.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">Your choices</h2>
            <p className="mt-2 text-muted-foreground">
              You may ask to access, correct or delete your account information, or object to
              analytics. Some request records must be kept to preserve the approval and audit trail.
              To make a request, contact{" "}
              <a href={`mailto:${SITE.contactEmail}`} className="text-primary underline">
                {SITE.contactEmail}
              </a>
              . Email delivery is not connected to this system yet; notifications appear only inside
              the application.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">Changes</h2>
            <p className="mt-2 text-muted-foreground">
              We may update this policy when the system changes. The date at the top shows the
              latest revision. Material changes will be announced in the application.
            </p>
          </section>
        </div>

        <p className="mt-10 text-sm">
          <Link to="/" className="text-primary underline">
            Return to the home page
          </Link>
        </p>
      </article>
    </PublicShell>
  );
}
