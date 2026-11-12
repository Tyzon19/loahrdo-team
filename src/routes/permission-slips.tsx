import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { unwrap } from "@/lib/api";
import { permissionLogoutFn } from "@/server-functions";

export const Route = createFileRoute("/permission-slips")({
  // The session lives in the Permission Slip cookie and is resolved on the
  // client, so the private pages never prerender for a signed-out visitor.
  ssr: false,
  beforeLoad: ({ context, location }) => {
    if (location.pathname === "/permission-slips/login") return;
    if (!context.permissionViewer) {
      throw redirect({
        to: "/permission-slips/login",
        search: { redirect: location.pathname },
      });
    }
  },
  component: PermissionSlipsLayout,
});

function PermissionSlipsLayout() {
  const { permissionViewer } = Route.useRouteContext();
  if (!permissionViewer) return <Outlet />;

  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <header className="no-print sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <img
              src="/loa-logo.png"
              alt="Lyceum of Alabang"
              className="h-9 w-9 shrink-0 object-contain"
            />
            <img
              src="/HRDO%20LOGO.png"
              alt="Human Resources Development Office"
              className="h-9 w-9 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight text-foreground">
                LOA Permission Slip
              </p>
              <p className="truncate text-xs text-muted-foreground">
                Human Resources Development Office
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-right text-xs leading-tight sm:block">
              <span className="block font-semibold text-foreground">{permissionViewer.name}</span>
              <span className="block text-muted-foreground">{permissionViewer.email}</span>
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-6 sm:py-6">
        <Outlet />
      </main>
    </div>
  );
}

function SignOutButton() {
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await unwrap(permissionLogoutFn());
      window.location.replace("/permission-slips/login");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "We couldn't sign you out. Please try again.",
      );
      setSigningOut(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-2"
      disabled={signingOut}
      onClick={() => void signOut()}
    >
      <LogOut className="h-4 w-4" aria-hidden />
      {signingOut ? "Signing out" : "Sign out"}
    </Button>
  );
}
