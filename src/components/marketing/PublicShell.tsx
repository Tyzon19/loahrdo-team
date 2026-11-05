import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LogOut, ShieldCheck } from "lucide-react";
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
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#222]">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link to="/" aria-label="Lyceum of Alabang home">
              <img src="/loa-loading.png" alt="Lyceum of Alabang" className="h-10 w-auto" />
            </Link>
            <img
              src="/HRDO%20LOGO.png"
              alt="Human Resources Development Office"
              className="h-9 w-9 object-contain"
            />
            <img
              src="/lyceum-logo.png.png"
              alt="Lyceum of Alabang seal"
              className="h-10 w-10 object-contain"
            />
          </div>
          <nav
            className="flex items-center gap-1 text-sm font-semibold"
            aria-label="Main navigation"
          >
            <Link
              to="/"
              hash="services"
              className="hidden rounded-md px-3 py-2 text-primary hover:bg-muted sm:block"
            >
              Services
            </Link>
            <Link
              to="/terms-of-service"
              className="hidden rounded-md px-3 py-2 text-primary hover:bg-muted sm:block"
            >
              About
            </Link>
            {signedIn ? (
              <Button asChild className="ml-2">
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" className="ml-2">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild>
                  <Link to="/register">Register</Link>
                </Button>
              </>
            )}
          </nav>
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
