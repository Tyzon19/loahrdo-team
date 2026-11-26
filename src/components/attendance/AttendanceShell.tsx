import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ClipboardCheck, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { attendanceAdminAllowed, type AttendanceViewer } from "@/lib/attendance-access";
import { attendanceLogoutFn } from "@/server-functions";
import { unwrap } from "@/lib/api";

export function AttendanceShell({
  user,
  children,
}: {
  user: AttendanceViewer;
  children: ReactNode;
}) {
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const admin = attendanceAdminAllowed(user);
  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await unwrap(attendanceLogoutFn());
      cache.clear();
      window.location.assign("/leaves/login");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to sign out.");
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <div className="border-b border-sidebar-border p-4">
          <img src="/HRDO%20LOGO.png" alt="HRDO" className="mb-3 h-12 w-12 object-contain" />
          <p className="text-sm font-semibold">Lyceum of Alabang</p>
          <p className="mt-1 text-xs opacity-80">Leave & Attendance</p>
        </div>
        <nav aria-label="Leave and Attendance navigation" className="flex-1 space-y-1 py-3">
          <PortalLink
            to={admin ? "/admin/late-absences" : "/leaves"}
            label={admin ? "Sync & Claims" : "My Leave & Attendance"}
            icon={admin ? ClipboardCheck : CalendarDays}
          />
          {user.accountRole === "director" && (
            <PortalLink
              to="/director/late-absences"
              label="Executive Attendance"
              icon={CalendarDays}
            />
          )}
          <PortalLink to="/leaves/account" label="Attendance Account" icon={UserRound} />
          <PortalLink to="/leaves/requests" label="Leave Applications" icon={ClipboardCheck} />
        </nav>
        <p className="border-t border-sidebar-border p-4 text-xs opacity-80">
          HRDO · Leave & Attendance
        </p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-2 border-b bg-card px-3 py-2 sm:px-6">
          <span className="font-semibold">Leave & Attendance</span>
          <span className="ml-auto max-w-48 truncate text-sm text-muted-foreground">
            {user.name}
          </span>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void signOut()}>
            <LogOut className="mr-2 h-4 w-4" aria-hidden />
            {busy ? "Signing out…" : "Sign out"}
          </Button>
        </header>
        <nav
          aria-label="Mobile attendance navigation"
          className="flex flex-wrap gap-2 border-b bg-card p-3 md:hidden"
        >
          <Button asChild size="sm" variant="outline">
            <Link to={admin ? "/admin/late-absences" : "/leaves"}>
              {admin ? "Sync & Claims" : "Attendance"}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/leaves/account">Account</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/leaves/requests">Leave Applications</Link>
          </Button>
          {user.accountRole === "director" && (
            <Button asChild size="sm" variant="outline">
              <Link to="/director/late-absences">Executive Attendance</Link>
            </Button>
          )}
        </nav>
        {error && (
          <p role="alert" className="px-4 pt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <main id="main-content" className="w-full flex-1 px-3 py-5 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function PortalLink({
  to,
  label,
  icon: Icon,
}: {
  to:
    | "/leaves"
    | "/leaves/account"
    | "/leaves/requests"
    | "/admin/late-absences"
    | "/director/late-absences";
  label: string;
  icon: typeof CalendarDays;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      activeProps={{ className: "bg-sidebar-accent font-medium text-sidebar-accent-foreground" }}
      className="flex min-h-11 items-center gap-2 px-4 py-2 text-sm hover:bg-sidebar-accent"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}
