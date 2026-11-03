import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";

export function PublicShell({
  children,
  signedIn = false,
  showFooter = true,
}: {
  children: ReactNode;
  signedIn?: boolean;
  showFooter?: boolean;
}) {
  const serviceLinks = [
    { label: "Vehicle Trip Ticketing", href: "/login" },
    { label: "COE Request", href: "/hrdo/coe" },
    { label: "Permission Slip", href: "/hrdo/requests" },
    { label: "Late & Absences", href: "/hrdo/history" },
    { label: "Employee Records", href: "/hrdo/profile" },
    { label: "HRDO Dashboard", href: "/hrdo/dashboard" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#222]">
      <header className="sticky top-0 z-30 border-b border-[#e1edf7] bg-white/95 backdrop-blur-sm shadow-[0_1px_0_rgba(10,44,79,0.04)]">
        <div className="mx-auto flex h-[95px] max-w-[1340px] items-center justify-between gap-5 px-6">
          <Link to="/" className="flex items-center gap-3" aria-label="Lyceum Home">
            <img
              src="/loa-loading.png"
              alt="Lyceum of Alabang official seal"
              className="h-[200px] w-[200px] object-contain"
            />
          </Link>

          <div className="flex items-center gap-6">
            <nav aria-label="Main navigation" className="hidden items-center gap-7 md:flex">
              <div className="group relative">
                <button
                  type="button"
                  className="flex items-center gap-1 text-[15px] font-semibold uppercase tracking-[0.01em] text-[#0F5C85] transition-colors hover:text-[#0b4670]"
                >
                  <span>Services</span>
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>

                <div className="absolute right-0 top-full z-20 mt-3 hidden min-w-[240px] rounded-md border border-[#dfeaf3] bg-white p-2 shadow-lg group-hover:block group-focus-within:block">
                  {serviceLinks.map((item) => (
                    <Link
                      key={item.label}
                      to={item.href}
                      className="block rounded-sm px-3 py-2 text-left text-[14px] font-medium text-[#0F5C85] transition-colors hover:bg-[#eef7ff] hover:text-[#0b4670]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>

              <Link
                to="/hrdo/dashboard"
                className="text-[15px] font-semibold uppercase tracking-[0.01em] text-[#0F5C85] transition-colors hover:text-[#0b4670]"
              >
                About
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              {!signedIn ? (
                <Link
                  to="/register"
                  className="inline-flex h-[37px] items-center justify-center rounded-[6px] bg-[#0F5C85] px-5 text-[15px] font-bold text-white shadow-sm transition-colors hover:bg-[#0b4d76]"
                >
                  Register
                </Link>
              ) : (
                <Button asChild size="sm">
                  <Link to="/dashboard">Open dashboard</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        {children}
      </main>

      {showFooter && (
        <footer className="border-t bg-card">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-foreground">
                {SITE.institution} · {SITE.office}
              </p>
              <p className="mt-0.5">Official vehicle reservation and trip ticket system.</p>
            </div>
            <nav className="flex flex-wrap items-center gap-4" aria-label="Footer">
              <Link to="/privacy" className="inline-flex items-center gap-1.5 hover:text-primary">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Privacy Policy
              </Link>
              <a href={`mailto:${SITE.contactEmail}`} className="hover:text-primary">
                {SITE.contactEmail}
              </a>
            </nav>
          </div>
        </footer>
      )}
    </div>
  );
}
