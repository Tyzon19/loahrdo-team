import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/components/marketing/PublicShell";
import { SITE, canonical } from "@/lib/site";

export const Route = createFileRoute("/terms-of-service")({
  head: () => ({
    meta: [
      { title: `Terms of Service — ${SITE.name}` },
      {
        name: "description",
        content: "Terms for using the Lyceum of Alabang online service portals.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: `Terms of Service — ${SITE.name}` },
      { property: "og:url", content: canonical("/terms-of-service") },
    ],
    links: [{ rel: "canonical", href: canonical("/terms-of-service") }],
  }),
  component: TermsOfServicePage,
});

function TermsOfServicePage() {
  return (
    <PublicShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Lyceum of Alabang · Online Services
        </p>
        <h1 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 5 November 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="font-serif text-xl font-semibold">Using the services</h2>
            <p className="mt-2 text-muted-foreground">
              These terms apply when you access the Lyceum of Alabang Vehicle Reservation and Trip
              Ticket and HRDO employee service portals. By using an account or submitting a request,
              you agree to use the service responsibly and follow the instructions shown in the
              relevant portal. The Privacy Policy explains how personal information is handled.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">Accounts and access</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>Provide accurate information and keep your account credentials confidential.</li>
              <li>
                Use only the access assigned to you. Do not share accounts, impersonate another
                person, or attempt to access records or functions outside your role.
              </li>
              <li>
                Notify the appropriate office if you believe your account has been accessed or used
                without permission.
              </li>
              <li>
                Staff and approver access is role-based and may be changed by an authorized
                administrator.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">Requests and submitted information</h2>
            <p className="mt-2 text-muted-foreground">
              Submit complete and truthful information and use the correct portal for your request.
              Requests are subject to review and the applicable institutional workflow. Submitting a
              request does not by itself mean it has been approved, that a vehicle is assigned, or
              that a document is ready. Follow the status and instructions shown in your account,
              and respond to requests for corrections when needed.
            </p>
            <p className="mt-2 text-muted-foreground">
              Do not upload or enter information that is unrelated to your request. You are
              responsible for ensuring that information you provide is accurate and that you are
              authorized to provide any information about another person.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">Acceptable use</h2>
            <p className="mt-2 text-muted-foreground">
              Do not disrupt the service, bypass access controls, introduce malicious content,
              misuse another person&apos;s information, or use the portals for unlawful or
              unauthorized purposes. Access may be limited while a reported issue is reviewed or to
              protect users and the service.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">Availability and changes</h2>
            <p className="mt-2 text-muted-foreground">
              The portals may be updated, temporarily unavailable, or have features changed to
              support institutional operations, maintenance, or security. Where practical, important
              changes to these terms will be reflected on this page. Continued use after an update
              means you accept the revised terms.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">Contact</h2>
            <p className="mt-2 text-muted-foreground">
              For questions about these terms or access to the HRDO portal, contact{" "}
              <a href={`mailto:${SITE.contactEmail}`} className="text-primary underline">
                {SITE.contactEmail}
              </a>
              . For privacy matters, see the{" "}
              <Link to="/privacy" className="text-primary underline">
                Privacy Policy
              </Link>
              .
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
