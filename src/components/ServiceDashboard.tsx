import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bus,
  ClipboardCheck,
  Facebook,
  FileBadge,
  FolderClock,
  LogOut,
  Mail,
  Phone,
  Search,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/app/LoadingPanel";
import { FACEBOOK_URL, LOGO_URL } from "@/components/AuthLayout";

type Service = {
  title: string;
  desc: string;
  icon: LucideIcon;
  tag: string;
  to?: "/requests/new" | "/coe" | "/permission-slips" | "/leaves";
};

const SERVICES: Service[] = [
  {
    title: "Vehicle Reservation",
    desc: "Book a school vehicle for official trips and activities.",
    icon: Bus,
    tag: "Transport",
    to: "/requests/new",
  },
  {
    title: "COE Request",
    desc: "Request your Certificate of Employment.",
    icon: FileBadge,
    tag: "Documents",
    to: "/coe",
  },
  {
    title: "Permission Slip",
    desc: "File a pass slip for leaving campus during work hours.",
    icon: FolderClock,
    tag: "Attendance",
    to: "/permission-slips",
  },
  {
    title: "Late & Absences",
    desc: "View leave balances, lates, absences, and attendance records.",
    icon: ClipboardCheck,
    tag: "Attendance",
    to: "/leaves",
  },
];

export function ServiceDashboard({
  authenticated = false,
  onSignOut,
}: {
  authenticated?: boolean;
  onSignOut?: () => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const list = SERVICES.filter((service) =>
    `${service.title} ${service.desc} ${service.tag}`.toLowerCase().includes(q.toLowerCase()),
  );

  async function signOut() {
    if (!onSignOut || signingOut) return;
    setSigningOut(true);
    try {
      await onSignOut();
    } catch {
      toast.error("We couldn't sign you out. Please try again.");
      setSigningOut(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full min-w-0 max-w-full flex-col bg-muted/40">
      {signingOut && <LoadingScreen label="Signing out" mode="overlay" immediate />}
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full min-w-0 max-w-6xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6">
          <div className="flex min-w-0 shrink items-center gap-1.5 sm:shrink-0 sm:gap-3">
            <img
              src={LOGO_URL}
              alt="Lyceum of Alabang"
              className="h-7 w-auto max-w-[112px] sm:h-10 sm:max-w-none"
            />
            <img
              src="/HRDO%20LOGO.png"
              alt="Human Resources Development Office"
              className="hidden h-9 w-9 object-contain sm:block"
            />
            <img
              src="/loa-logo.png"
              alt="Lyceum of Alabang seal"
              className="hidden h-10 w-10 object-contain sm:block"
            />
          </div>
          <nav className="flex shrink-0 items-center gap-0.5 text-sm font-semibold sm:gap-1">
            <a
              href="#services"
              className="hidden rounded-md px-3 py-2 text-primary hover:bg-muted sm:block"
            >
              Services
            </a>
            <Link
              to="/terms-of-service"
              className="hidden rounded-md px-3 py-2 text-primary hover:bg-muted sm:block"
            >
              About
            </Link>
            {authenticated ? (
              <Button
                type="button"
                disabled={signingOut}
                onClick={() => void signOut()}
                className="ml-2"
              >
                <LogOut className="h-4 w-4" aria-hidden /> Sign out
              </Button>
            ) : (
              <>
                <Button
                  asChild
                  variant="ghost"
                  className="ml-0 h-11 px-2 text-xs sm:ml-2 sm:h-9 sm:px-4 sm:text-sm"
                >
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild className="h-11 px-2 text-xs sm:h-9 sm:px-4 sm:text-sm">
                  <Link to="/register">Register</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="relative isolate w-full min-w-0 overflow-hidden">
        <img
          src="/lyceum-building.png.png"
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover grayscale"
        />
        <div className="absolute inset-0 -z-10 bg-overlay mix-blend-multiply" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-primary/90 via-primary/60 to-transparent" />
        <div className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-20 pt-12 text-primary-foreground sm:px-6 sm:pb-28 sm:pt-16 md:pt-24">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] opacity-80">Welcome to</p>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-6xl">
            LOA HRDO Desk
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed opacity-90 md:text-lg">
            Transforming employee services for a faster, convenient, and smarter digital experience
            for staff and stakeholders.
          </p>
        </div>
      </section>

      <main
        id="services"
        className="relative z-10 mx-auto -mt-12 w-full min-w-0 max-w-6xl flex-1 px-3 pb-12 sm:-mt-16 sm:px-6 sm:pb-16"
      >
        <div className="min-w-0 rounded-2xl border border-border bg-background p-4 shadow-xl sm:p-5 md:p-8">
          <div className="mb-6 grid gap-4 md:flex md:items-end md:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-overlay">
                Explore our services
              </p>
              <h2 className="mt-1 text-xl font-bold leading-tight text-foreground sm:text-2xl">
                What do you need today?
              </h2>
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 md:w-72">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                aria-label="Search services"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Search services"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>

          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {list.map((service) => {
              const Icon = service.icon;
              const className =
                "group flex min-h-52 min-w-0 w-full touch-manipulation flex-col items-start rounded-xl border border-border bg-background p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/[0.03] hover:shadow-md active:translate-y-0 active:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";
              return service.to ? (
                <Link key={service.title} to={service.to} className={className}>
                  <ServiceCardContents service={service} icon={Icon} />
                </Link>
              ) : (
                <button
                  key={service.title}
                  type="button"
                  onClick={() => toast(`${service.title} is coming soon`)}
                  className={className}
                >
                  <ServiceCardContents service={service} icon={Icon} />
                </button>
              );
            })}
            {list.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                No services match &quot;{q}&quot;.
              </p>
            )}
          </div>

          {authenticated && (
            <div className="mt-5 flex flex-wrap gap-4 border-t pt-4 text-sm">
              <Link to="/requests" className="font-semibold text-primary hover:underline">
                View my vehicle requests
              </Link>
              <Link
                to="/profile"
                search={{ portal: undefined }}
                className="font-semibold text-primary hover:underline"
              >
                Account profile
              </Link>
            </div>
          )}
        </div>
      </main>
      <footer className="bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-xs font-semibold uppercase tracking-wide sm:px-6 md:grid-cols-3 md:items-center">
          <div className="flex items-center gap-3">
            Message us
            <a
              href={FACEBOOK_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Facebook"
              className="grid h-8 w-8 place-items-center rounded-full border border-primary-foreground/40 hover:bg-primary-foreground/10"
            >
              <Facebook className="h-4 w-4" aria-hidden />
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-4 normal-case md:justify-center">
            <span className="inline-flex items-center gap-2">
              <Phone className="h-4 w-4" aria-hidden />
              156
            </span>
            <a
              href="mailto:hrdo@lyceumalabang.edu.ph"
              className="inline-flex items-center gap-2 hover:underline"
            >
              <Mail className="h-4 w-4" aria-hidden />
              hrdo@lyceumalabang.edu.ph
            </a>
          </div>
          <div className="flex gap-4 md:justify-end">
            <Link to="/terms-of-service" className="hover:underline">
              Terms of Service
            </Link>
            <span className="opacity-70">FAQs</span>
            <Link to="/privacy" className="hover:underline">
              Privacy Policy
            </Link>
          </div>
        </div>
        <p className="border-t border-primary-foreground/15 py-4 text-center text-xs opacity-70">
          © 2026 Lyceum of Alabang HRDO. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
function ServiceCardContents({ service, icon: Icon }: { service: Service; icon: LucideIcon }) {
  return (
    <>
      <div className="flex w-full items-center justify-between">
        <span className="grid h-16 w-16 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="h-8 w-8" aria-hidden />
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          {service.tag}
        </span>
      </div>
      <h3 className="mt-5 text-lg font-bold text-foreground">{service.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{service.desc}</p>
      <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
        {service.to ? "Open" : "Coming soon"}
        <ArrowRight
          className="h-5 w-5 transition-transform group-hover:translate-x-1"
          aria-hidden
        />
      </span>
    </>
  );
}
