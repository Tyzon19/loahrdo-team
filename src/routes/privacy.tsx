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
          "How the Lyceum of Alabang HRDO Certificate of Employment system collects, uses and protects account, request and analytics information.",
      },
      { property: "og:title", content: `Privacy Policy — ${SITE.name}` },
      {
        property: "og:description",
        content:
          "How the Lyceum of Alabang HRDO Certificate of Employment system handles your information.",
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
          Lyceum of Alabang · Human Resources Development Office (HRDO)
        </p>
        <h1 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 27 October 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="font-serif text-xl font-semibold">Who we are</h2>
            <p className="mt-2 text-muted-foreground">
              This system is operated by the Lyceum of Alabang Human Resources Development Office
              (HRDO) to manage Certificate of Employment (COE) requests and employment
              verification. It is intended to handle personal
              information in line with Republic Act No. 10173, the Data Privacy Act of 2012, its
              Implementing Rules and Regulations, and the Lyceum of Alabang Data Privacy Statement.
              This notice explains how information is used in this system; it does not replace the
              institution-wide statement. Questions about this policy or your data can be sent to{" "}
              <a href={`mailto:${SITE.contactEmail}`} className="text-primary underline">
                {SITE.contactEmail}
              </a>
              . Read the{" "}
              <a
                href="https://lyceumalabang.edu.ph/data-privacy-statement/"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Lyceum of Alabang Data Privacy Statement
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
                <strong className="text-foreground">Request details:</strong> employee and
                verifier information, employment details, COE type, copy and delivery preference,
                purpose, consent records, uploaded authorization documents, remarks, returns and
                approval history.
              </li>
              <li>
                <strong className="text-foreground">In-app notifications:</strong> alerts addressed
                to your account when a request needs your attention.
              </li>
              <li>
                <strong className="text-foreground">Account verification:</strong> your official
                email address is used to send a one-time registration code through Google&apos;s
                email service.
              </li>
              <li>
                <strong className="text-foreground">Technical logs:</strong> session records,
                timestamps and aggregate page-view counts. We do not store your IP address in the
                analytics table, and we never store query strings there.
              </li>
            </ul>
            <p className="mt-3 text-muted-foreground">
              Please provide only information needed to process a COE or verification request. Avoid entering
              sensitive personal information about yourself or others in the purpose or remarks
              fields unless it is necessary for the request.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">Purpose and lawful processing</h2>
            <p className="mt-2 text-muted-foreground">
              Information is used only as needed to verify accounts, process and approve COE and
              employment verification requests, prepare official employment documents, maintain
              required administrative records, protect the system, and support HRDO operations. It is
              processed for these stated purposes on a lawful basis under applicable law. Consent is
              requested for optional analytics. We do not sell personal information or use it for
              advertising.
            </p>
            <p className="mt-2 text-muted-foreground">
              Access is limited to authorized users whose roles require the information. Google
              provides the email service used for registration verification. Google Analytics is
              used only if you accept optional analytics. These services process information as
              needed to provide their respective features.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">Who can see a request</h2>
            <div className="mt-2 space-y-2 text-muted-foreground">
              <p className="flex gap-2">
                <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />A
                requisitioner can only see requests filed by their own account.
              </p>
              <p className="flex gap-2">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                HRDO staff and other authorized personnel can see requests because their role
                requires it. Every server request re-checks your session and role; hiding a button
                in the browser is never treated as protection.
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
                starts only after you choose <strong>Accept analytics</strong>. If you accept, we
                use Google Analytics 4 with IP anonymization and a cookie-free first-party page-view
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
              COE, verification, uploaded document and approval records are retained as part of the office&apos;s
              administrative record in line with the institution&apos;s applicable retention
              requirements. Sessions expire automatically and expired sessions are removed.
              Aggregate analytics counts are retained for service improvement and do not identify
              you in this system.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">How we protect it</h2>
            <p className="mt-2 text-muted-foreground">
              Lyceum of Alabang&apos;s Data Privacy Statement describes the institution&apos;s
              commitment to physical, organizational and technical safeguards. This system also
              applies the following technical controls:
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>
                Passwords are hashed with salted scrypt; sessions use random tokens stored only as
                hashes.
              </li>
              <li>
                Database credentials stay in server-side configuration and are never sent to the
                browser.
              </li>
              <li>
                The application uses a dedicated database account limited to the operations it
                needs.
              </li>
              <li>All database queries are parameterized to prevent SQL injection.</li>
              <li>
                Every page and server action validates input and re-checks the signed-in role.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl font-semibold">Your privacy rights and choices</h2>
            <p className="mt-2 text-muted-foreground">
              Subject to the Data Privacy Act and other applicable requirements, you may ask to be
              informed about, access or correct your personal information, object to or request
              blocking or erasure of information, and exercise other rights available to you under
              the law. Some request records may need to be retained for institutional, legal or
              audit purposes. You may decline or withdraw optional analytics consent at any time
              using the control above. To make a privacy request, contact{" "}
              <a href={`mailto:${SITE.contactEmail}`} className="text-primary underline">
                {SITE.contactEmail}
              </a>
              . Account verification codes may be sent to your official email; workflow
              notifications and released COE documents are available inside the application.
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
