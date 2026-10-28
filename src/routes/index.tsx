import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Bus, CalendarClock, FileBadge, FileCheck2, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE, canonical } from "@/lib/site";

type Service = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  available: boolean;
};

const SERVICES: Service[] = [
  {
    id: "vehicle",
    title: "Vehicle Reservation & Trip Ticket",
    description: "Access vehicle reservation and official trip ticket services.",
    icon: Bus,
    available: true,
  },
  {
    id: "coe",
    title: "COE Request",
    description: "Submit a Certificate of Employment request and access its status.",
    icon: FileBadge,
    available: true,
  },
  {
    id: "permission-slip",
    title: "Permission Slip Request",
    description: "Access and submit permission slip requests.",
    icon: FileCheck2,
    available: false,
  },
  {
    id: "late-absences",
    title: "Late/Absences (Notification)",
    description: "View notifications and information related to employee lateness and absences.",
    icon: CalendarClock,
    available: false,
  },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LOA HRDO DESK | Lyceum of Alabang" },
      {
        name: "description",
        content:
          "Access Lyceum of Alabang employee services and submit requests through one convenient portal.",
      },
      { property: "og:title", content: "LOA HRDO DESK | Lyceum of Alabang" },
      {
        property: "og:description",
        content: "Employee services of the Human Resources Development Office, Lyceum of Alabang.",
      },
      { property: "og:url", content: canonical("/") },
      { property: "og:image", content: `${SITE.url}${SITE.ogImage}` },
      { property: "og:image:alt", content: SITE.ogImageAlt },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: canonical("/") }],
  }),
  component: EmployeePortal,
});

function EmployeePortal() {
  const { viewer } = Route.useRouteContext();
  const signedIn = Boolean(viewer);

  return (
    <div id="top" className="flex min-h-screen flex-col bg-background">
      <nav aria-label="Primary" className="bg-slate-800 text-white">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-wrap items-center justify-between gap-x-6 px-4 sm:px-6 lg:px-8">
          <ul className="-ml-3 flex flex-wrap items-center">
            <li>
              <a
                href="#top"
                className="block px-3 py-2.5 text-sm font-medium transition-colors hover:bg-white/10 sm:text-base"
              >
                Home
              </a>
            </li>
            <li>
              <a
                href="#services"
                className="block px-3 py-2.5 text-sm font-medium transition-colors hover:bg-white/10 sm:text-base"
              >
                Employee Services
              </a>
            </li>
            <li>
              <a
                href="#announcements"
                className="block px-3 py-2.5 text-sm font-medium transition-colors hover:bg-white/10 sm:text-base"
              >
                Announcements
              </a>
            </li>
          </ul>
          <a
            href="https://www.lyceumalabang.edu.ph/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden py-2.5 text-sm text-white/80 transition-colors hover:text-white sm:block sm:text-base"
          >
            lyceumalabang.edu.ph
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </nav>

      <header className="border-b-[3px] border-amber-400 bg-primary text-primary-foreground">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center gap-3 px-4 py-2.5 sm:px-6 md:gap-4 lg:px-8">
          <img
            src="/loa-logo.png"
            alt="Lyceum of Alabang official seal"
            width={56}
            height={56}
            className="h-12 w-12 shrink-0 rounded-full bg-white p-0.5 sm:h-14 sm:w-14"
          />
          <div className="min-w-0 leading-tight">
            <p className="font-serif text-[11px] uppercase tracking-[0.16em] text-white/75 sm:text-xs">
              Lyceum of Alabang
            </p>
            <p className="mt-0.5 font-serif text-xl font-semibold tracking-wide sm:text-2xl">
              LOA DESK
            </p>
            <p className="mt-0.5 hidden text-xs text-white/75 sm:block">
              Human Resources Development Office
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {signedIn && (
              <Button asChild size="sm" variant="secondary">
                <Link to="/hrdo/dashboard" className="px-3 text-sm sm:text-base">
                  Open my dashboard
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col justify-center px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xl font-semibold text-muted-foreground sm:text-2xl">
              Human Resources Development Office
            </p>
            <h1 className="mt-0.5 text-3xl font-bold tracking-tight text-primary sm:text-4xl">
              LOA DESK
            </h1>
            <p className="mt-2 text-base text-muted-foreground sm:text-lg">
              Explore the services available to employees through LOA HRDO Desk.
            </p>
          </div>

          <section
            id="services"
            aria-labelledby="services-heading"
            className="mt-5 scroll-mt-4 sm:mt-6 lg:mt-7"
          >
            <h2 id="services-heading" className="sr-only">
              Employee services
            </h2>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-2.5">
              {SERVICES.map((service) => {
                const Icon = service.icon;
                const className =
                  "group flex h-full w-full items-start gap-4 rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-secondary hover:shadow-md focus-visible:border-primary sm:min-h-48 sm:flex-col sm:items-center sm:justify-center sm:gap-4 sm:p-5 sm:text-center lg:min-h-52 lg:p-6";
                return (
                  <li key={service.id}>
                    {service.available ? (
                      <Link
                        to={
                          service.id === "coe"
                            ? "/hrdo/coe"
                            : viewer?.role === "requisitioner"
                              ? "/requests/new"
                              : signedIn
                                ? "/hrdo/dashboard"
                                : "/login"
                        }
                        className={className}
                      >
                        <Icon
                          aria-hidden="true"
                          strokeWidth={1.5}
                          className="mt-0.5 h-10 w-10 shrink-0 text-primary sm:mt-0 sm:h-14 sm:w-14"
                        />
                        <span className="min-w-0">
                          <span className="block text-lg font-bold leading-snug text-foreground group-hover:text-primary sm:text-xl">
                            {service.title}
                          </span>
                          <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground sm:text-base">
                            {service.description}
                          </span>
                        </span>
                      </Link>
                    ) : (
                      <div className={`${className} cursor-not-allowed opacity-75`}>
                        <Icon
                          aria-hidden="true"
                          strokeWidth={1.5}
                          className="mt-0.5 h-10 w-10 shrink-0 text-primary sm:mt-0 sm:h-14 sm:w-14"
                        />
                        <span className="min-w-0">
                          <span className="block text-lg font-bold leading-snug text-foreground sm:text-xl">
                            {service.title}
                          </span>
                          <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground sm:text-base">
                            {service.description}
                          </span>
                          <span className="mt-2 inline-block rounded-sm bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                            Not available online yet
                          </span>
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section
            id="announcements"
            aria-labelledby="announcements-heading"
            className="mt-5 scroll-mt-4 border-l-4 border-sky-300 py-2 pl-4 sm:mt-6 sm:pl-5"
          >
            <h2
              id="announcements-heading"
              className="text-base font-bold uppercase tracking-wide text-primary sm:text-lg"
            >
              Announcements
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground sm:text-base">
              There are no announcements from the Human Resources Development Office at this time.
            </p>
          </section>
        </div>
      </main>

      <footer className="bg-slate-800 text-white">
        <div className="mx-auto grid w-full max-w-screen-2xl gap-4 px-4 py-4 sm:px-6 md:grid-cols-2 md:items-center md:gap-0 lg:px-8">
          <div className="flex items-center gap-3 md:pr-8">
            <img
              src="/loa-logo.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded-full bg-white p-0.5"
            />
            <div className="leading-snug">
              <p className="font-serif text-base font-semibold uppercase tracking-wide sm:text-lg">
                Lyceum of Alabang
              </p>
              <p className="text-xs uppercase tracking-wide text-white/70 sm:text-sm">
                Human Resources Development Office
              </p>
              <p className="mt-1 text-xs text-white/70 sm:text-sm">LOA DESK</p>
            </div>
          </div>
          <div className="border-t border-white/20 pt-3 md:border-l md:border-t-0 md:py-1 md:pl-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Contact &amp; links</h2>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-white/75">
              <li>
                <a
                  href={`mailto:${SITE.contactEmail}`}
                  className="inline-flex items-center gap-2 hover:text-white hover:underline"
                >
                  <Mail className="h-4 w-4" aria-hidden />
                  {SITE.contactEmail}
                </a>
              </li>
              <li>
                <Link to="/privacy" className="hover:text-white hover:underline">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <a
                  href="https://www.lyceumalabang.edu.ph/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-white hover:underline"
                >
                  Lyceum of Alabang Website
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
