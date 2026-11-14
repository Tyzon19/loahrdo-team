import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowUpRight, Building2, Car, Clock3, FileText, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { canAccessAdminPortal } from "@/lib/access";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => {
    if (
      !context.viewer ||
      !canAccessAdminPortal(context.viewer.role, context.viewer.isSuperAdmin)
    ) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: `Admin Dashboard | ${SITE.name}` },
      { name: "description", content: "Manage Lyceum of Alabang systems from one dashboard." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminDashboard,
});

const SYSTEMS = [
  {
    title: "Vehicle Trip Ticket",
    description: "Manage vehicle requests, the fleet, and trip records.",
    to: "/dashboard",
    icon: Car,
  },
  {
    title: "Certificate of Employment",
    description: "Review COE requests and HRDO processing.",
    to: "/hrdo/dashboard",
    icon: FileText,
  },
  {
    title: "Permission Slip",
    description: "View the queue; approvals stay with the designated HRDO Head.",
    to: "/permission-slips",
    icon: ShieldCheck,
  },
] as const;

function AdminDashboard() {
  const { viewer } = Route.useRouteContext();
  if (!viewer) return null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Admin Dashboard"
        description="Manage the available systems from one place."
      />

      <section aria-labelledby="admin-systems-heading">
        <h2 id="admin-systems-heading" className="text-base font-semibold">
          Systems
        </h2>
        <ul className="mt-3 divide-y rounded-lg border bg-card">
          {SYSTEMS.map(({ title, description, to, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="group grid min-h-[76px] grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 sm:gap-4 sm:px-5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">{title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
                </span>
                <span className="flex items-center gap-1 text-sm font-medium text-primary">
                  Open
                  <ArrowUpRight
                    className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-active:-translate-y-0.5"
                    aria-hidden
                  />
                </span>
              </Link>
            </li>
          ))}
          <li className="grid min-h-[76px] grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 sm:gap-4 sm:px-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Clock3 className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-medium text-muted-foreground">Late &amp; Absences</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                This system is not available yet.
              </span>
            </span>
            <span className="text-xs font-medium text-muted-foreground">Coming soon</span>
          </li>
        </ul>
      </section>

      {viewer.isSuperAdmin && (
        <section
          aria-labelledby="admin-access-heading"
          className="mt-8 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <h2 id="admin-access-heading" className="font-semibold">
                System access
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Assign Super Admin and Permission Slip Admin access.
              </p>
            </div>
          </div>
          <Link
            to="/profile"
            search={{ portal: undefined, tab: "system-access" }}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent focus-visible:bg-accent"
          >
            Manage access
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>
      )}
    </div>
  );
}
