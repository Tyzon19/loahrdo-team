import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  BriefcaseBusiness,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { PublicShell } from "@/components/marketing/PublicShell";
import { Button } from "@/components/ui/button";
import { SITE, canonical } from "@/lib/site";

const SERVICE_PAGES = {
  "request-a-service": {
    title: "Request a Service",
    subtitle: "Submit HRDO service requests for vehicle booking, permits, and office transactions.",
    description:
      "Use this service to request official office assistance, transportation arrangements, or document-related support from the HRDO team.",
    steps: [
      "Prepare the required details for your request.",
      "Submit your service request through the secure portal.",
      "Track updates and receive notifications as approval progresses.",
    ],
  },
  "report-a-concern": {
    title: "Report a Concern",
    subtitle:
      "Report issues or process concerns involving workplace, travel, and employee support needs.",
    description:
      "Share operational problems, service delays, or workplace issues so the HRDO team can review, respond, and resolve them appropriately.",
    steps: [
      "Document the nature of the concern or issue.",
      "Provide relevant context and supporting details.",
      "Wait for review, follow-up, and resolution updates.",
    ],
  },
  "raise-a-concern": {
    title: "Raise a Concern",
    subtitle:
      "Share feedback, complaints, and suggestions to help improve HRDO support and operations.",
    description:
      "Provide feedback that helps improve HRDO support services, communication, and employee experience across the office.",
    steps: [
      "Share your feedback or complaint clearly.",
      "Include any relevant details or supporting information.",
      "Use the submitted concern to improve office service delivery.",
    ],
  },
  "request-for-information": {
    title: "Request for Information",
    subtitle:
      "Ask for employee service details, office procedures, and public information requests.",
    description:
      "Submit information requests for office procedures, employee service details, and other formal inquiries that require assistance from HRDO.",
    steps: [
      "Identify the information you need.",
      "State the purpose and any relevant details.",
      "Wait for the HRDO team to verify and reply.",
    ],
  },
} as const;

export const Route = createFileRoute("/service/$slug")({
  component: ServiceDetailPage,
  head: ({ params }) => {
    const page =
      SERVICE_PAGES[params.slug as keyof typeof SERVICE_PAGES] ??
      SERVICE_PAGES["request-a-service"];
    return {
      meta: [
        { title: `${page.title} — ${SITE.name}` },
        { name: "description", content: page.subtitle },
        { property: "og:title", content: `${page.title} — ${SITE.name}` },
        { property: "og:description", content: page.description },
        { property: "og:url", content: canonical(`/service/${params.slug}`) },
      ],
      links: [{ rel: "canonical", href: canonical(`/service/${params.slug}`) }],
    };
  },
});

function ServiceDetailPage() {
  const { slug } = Route.useParams();
  const { viewer, hrdoViewer, permissionViewer } = Route.useRouteContext();
  const page =
    SERVICE_PAGES[slug as keyof typeof SERVICE_PAGES] ?? SERVICE_PAGES["request-a-service"];

  return (
    <PublicShell signedIn={Boolean(viewer || hrdoViewer || permissionViewer)}>
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:py-16">
        <div className="mb-8 flex items-center gap-2 text-sm font-medium text-primary">
          <BookOpenText className="h-4 w-4" aria-hidden />
          <span>HRDO Service</span>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {SITE.institution} · {SITE.office}
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#0F5C85] sm:text-5xl">
              {page.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-[#222]">{page.subtitle}</p>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              {page.description}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/login" className="inline-flex items-center gap-2">
                  Continue to sign in
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/register">Create account</Link>
              </Button>
            </div>
          </div>

          <aside className="rounded-2xl border border-[#d9edf8] bg-[#f5fbff] p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#0F5C85]">
              How it works
            </p>
            <ul className="mt-5 space-y-4">
              {page.steps.map((step) => (
                <li key={step} className="flex items-start gap-3 text-sm leading-6 text-[#1a1a1a]">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#D6E9F8] text-[#0F5C85]">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[#d9edf8] p-5">
            <BriefcaseBusiness className="h-8 w-8 text-[#0F5C85]" aria-hidden />
            <h2 className="mt-4 text-base font-semibold text-[#0F5C85]">Fast processing</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Submit requests through the secure portal and keep track of progress in one place.
            </p>
          </div>
          <div className="rounded-xl border border-[#d9edf8] p-5">
            <ShieldCheck className="h-8 w-8 text-[#0F5C85]" aria-hidden />
            <h2 className="mt-4 text-base font-semibold text-[#0F5C85]">Secure access</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Only authorized users can manage and monitor sensitive HRDO service requests.
            </p>
          </div>
          <div className="rounded-xl border border-[#d9edf8] p-5">
            <Mail className="h-8 w-8 text-[#0F5C85]" aria-hidden />
            <h2 className="mt-4 text-base font-semibold text-[#0F5C85]">Clear updates</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Receive progress updates and respond to follow-up requests without delays.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link to="/">Back to home</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/privacy">Read privacy policy</Link>
          </Button>
        </div>
      </div>
    </PublicShell>
  );
}
