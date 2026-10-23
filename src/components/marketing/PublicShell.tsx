import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";

export function PublicShell({
  children,
  signedIn = false,
}: {
  children: ReactNode;
  signedIn?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <img
              src="/loa-logo.png"
              alt="Lyceum of Alabang official seal"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 object-contain"
            />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold">Lyceum of Alabang</span>
              <span className="hidden text-xs text-muted-foreground sm:block">
                Vehicle Reservation &amp; Trip Ticket
              </span>
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-5 text-sm sm:flex" aria-label="Public">
            <Link to="/" className="hover:text-primary">
              Home
            </Link>
            <Link to="/privacy" className="hover:text-primary">
              Privacy Policy
            </Link>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-4">
            {signedIn ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/register">Request a vehicle</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        {children}
      </main>

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
    </div>
  );
}
