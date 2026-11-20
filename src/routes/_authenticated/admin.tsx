import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Building2,
  Car,
  ClipboardCheck,
  FileText,
  ShieldCheck,
  UserRound,
  Users,
  Clock3,
  CircleCheck,
  CircleX,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { canAccessAdminPortal } from "@/lib/access";
import { SITE } from "@/lib/site";
import { unwrap } from "@/lib/api";
import { listAdminOperationsOverviewFn, listSuperAdminOverviewFn } from "@/server-functions";
import { Button } from "@/components/ui/button";

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
  {
    title: "Late & Absences",
    description: "Manage attendance trackers, employee balances, and discrepancy records.",
    to: "/admin/late-absences",
    icon: ClipboardCheck,
  },
] as const;

function AdminDashboard() {
  const { viewer } = Route.useRouteContext();
  const overview = useQuery({
    queryKey: ["super-admin-overview"],
    queryFn: () => unwrap(listSuperAdminOverviewFn()),
    enabled: Boolean(viewer?.isSuperAdmin),
    staleTime: 30_000,
  });
  const operations = useQuery({
    queryKey: ["admin-operations-overview"],
    queryFn: () => unwrap(listAdminOperationsOverviewFn()),
    enabled: Boolean(viewer?.role === "admin" && !viewer.isSuperAdmin),
    staleTime: 30_000,
  });
  if (!viewer) return null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <PageHeader
        title={viewer.isSuperAdmin ? "Super Admin Dashboard" : "Admin Dashboard"}
        description={
          viewer.isSuperAdmin
            ? "Organization-wide monitoring, system access, and module management."
            : "Manage your assigned systems and records."
        }
        actions={
          viewer.isSuperAdmin ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => void overview.refetch()}
              disabled={overview.isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${overview.isFetching ? "animate-spin" : ""}`}
                aria-hidden
              />
              Refresh
            </Button>
          ) : undefined
        }
      />

      {viewer.isSuperAdmin && (
        <>
          {overview.isPending ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-xl border bg-muted/40" />
              ))}
            </div>
          ) : overview.isError ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-danger-soft p-5"
            >
              <p className="font-semibold">System overview could not be loaded.</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3 min-h-11"
                onClick={() => void overview.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : !overview.data ? (
            <div
              role="status"
              className="rounded-xl border bg-card p-5 text-sm text-muted-foreground"
            >
              Super Admin overview is unavailable.
            </div>
          ) : (
            <>
              <section
                className="grid grid-cols-2 gap-3 lg:grid-cols-5"
                aria-label="Super Admin totals"
              >
                <OverviewCard
                  label="Employees"
                  value={overview.data.totals.employees}
                  icon={<Users />}
                />
                <OverviewCard
                  label="Total Users"
                  value={overview.data.totals.users}
                  icon={<UserRound />}
                />
                <OverviewCard
                  label="Active Users"
                  value={overview.data.totals.activeUsers}
                  icon={<CircleCheck />}
                />
                <OverviewCard
                  label="Pending"
                  value={overview.data.totals.pending}
                  icon={<Clock3 />}
                />
                <OverviewCard
                  label="Rejected"
                  value={overview.data.totals.rejected}
                  icon={<CircleX />}
                />
              </section>

              <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)]">
                <div className="rounded-xl border bg-card p-5">
                  <div className="flex items-end justify-between gap-3 border-b pb-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Request overview
                      </p>
                      <h2 className="mt-1 text-lg font-semibold">Across all modules</h2>
                    </div>
                    <p className="text-right text-2xl font-semibold tabular-nums">
                      {overview.data.totals.completed}
                      <span className="block text-xs font-normal text-muted-foreground">
                        completed
                      </span>
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                      ["Vehicle Trip Ticket", overview.data.modules.transportation],
                      ["Certificate of Employment", overview.data.modules.coe],
                      ["Permission Slip", overview.data.modules.permissionSlip],
                      ["Late & Absences", overview.data.modules.lateAbsences],
                    ].map(([label, counts]) => (
                      <ModuleMetric
                        key={String(label)}
                        label={String(label)}
                        counts={counts as { pending: number; completed: number; rejected: number }}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border bg-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Recent registrations
                  </p>
                  <div className="mt-3 divide-y">
                    {overview.data.recentUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex min-w-0 items-center gap-3 py-3 first:pt-1"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {initials(user.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{user.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    ))}
                    {!overview.data.recentUsers.length && (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        No registered users yet.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {!viewer.isSuperAdmin && viewer.role === "admin" && (
        <>
          {operations.isPending ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-xl border bg-muted/40" />
              ))}
            </div>
          ) : operations.isError ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-danger-soft p-5"
            >
              <p className="font-semibold">Operations overview could not be loaded.</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3 min-h-11"
                onClick={() => void operations.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : !operations.data ? (
            <div
              role="status"
              className="rounded-xl border bg-card p-5 text-sm text-muted-foreground"
            >
              Operations overview is unavailable.
            </div>
          ) : (
            <section className="space-y-4" aria-label="HR operations overview">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
                <OverviewCard
                  label="Employees"
                  value={operations.data.employees}
                  icon={<Users />}
                />
                <OverviewCard
                  label="All Requests"
                  value={
                    operations.data.totals.transportation.total +
                    operations.data.totals.coe.total +
                    operations.data.totals.permissionSlip.total
                  }
                  icon={<ClipboardCheck />}
                />
                <OverviewCard
                  label="Pending"
                  value={
                    operations.data.totals.transportation.pending +
                    operations.data.totals.coe.pending +
                    operations.data.totals.permissionSlip.pending +
                    operations.data.totals.lateAbsences.pending
                  }
                  icon={<Clock3 />}
                />
                <OverviewCard
                  label="For Approval"
                  value={
                    operations.data.totals.transportation.forApproval +
                    operations.data.totals.coe.forApproval +
                    operations.data.totals.permissionSlip.forApproval
                  }
                  icon={<ShieldCheck />}
                />
                <OverviewCard
                  label="Approved"
                  value={
                    operations.data.totals.transportation.approved +
                    operations.data.totals.coe.approved +
                    operations.data.totals.permissionSlip.approved
                  }
                  icon={<CircleCheck />}
                />
                <OverviewCard
                  label="Rejected"
                  value={
                    operations.data.totals.transportation.rejected +
                    operations.data.totals.coe.rejected +
                    operations.data.totals.permissionSlip.rejected
                  }
                  icon={<CircleX />}
                />
                <OverviewCard
                  label="Completed"
                  value={
                    operations.data.totals.transportation.completed +
                    operations.data.totals.coe.completed +
                    operations.data.totals.permissionSlip.completed
                  }
                  icon={<Building2 />}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,.6fr)]">
                <div className="rounded-xl border bg-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Request management
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">Daily HRDO operations</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                      ["Vehicle Trip Ticket", "/requests", operations.data.totals.transportation],
                      ["Certificate of Employment", "/hrdo/dashboard", operations.data.totals.coe],
                      [
                        "Permission Slip",
                        "/permission-slips",
                        operations.data.totals.permissionSlip,
                      ],
                      [
                        "Late & Absences",
                        "/admin/late-absences",
                        operations.data.totals.lateAbsences,
                      ],
                    ].map(([label, to, counts]) => (
                      <Link
                        key={String(label)}
                        to={String(to)}
                        className="group rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{String(label)}</p>
                          <ArrowUpRight
                            className="h-4 w-4 text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                            aria-hidden
                          />
                        </div>
                        <p className="mt-2 text-2xl font-semibold tabular-nums">
                          {(counts as { pending: number }).pending}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            pending
                          </span>
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border bg-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Reports & people
                  </p>
                  <div className="mt-3 space-y-2">
                    <Link
                      to="/phone-directory"
                      className="flex min-h-12 items-center justify-between rounded-lg border px-3 text-sm font-medium hover:bg-muted/40"
                    >
                      Employee directory{" "}
                      <ArrowUpRight className="h-4 w-4 text-primary" aria-hidden />
                    </Link>
                    <Link
                      to="/trip-archive"
                      className="flex min-h-12 items-center justify-between rounded-lg border px-3 text-sm font-medium hover:bg-muted/40"
                    >
                      Vehicle reports <ArrowUpRight className="h-4 w-4 text-primary" aria-hidden />
                    </Link>
                    <Link
                      to="/hrdo/history"
                      className="flex min-h-12 items-center justify-between rounded-lg border px-3 text-sm font-medium hover:bg-muted/40"
                    >
                      COE reports <ArrowUpRight className="h-4 w-4 text-primary" aria-hidden />
                    </Link>
                    <Link
                      to="/receipts"
                      className="flex min-h-12 items-center justify-between rounded-lg border px-3 text-sm font-medium hover:bg-muted/40"
                    >
                      Receipts archive <ArrowUpRight className="h-4 w-4 text-primary" aria-hidden />
                    </Link>
                    <Link
                      to="/notifications"
                      className="flex min-h-12 items-center justify-between rounded-lg border px-3 text-sm font-medium hover:bg-muted/40"
                    >
                      Notifications <ArrowUpRight className="h-4 w-4 text-primary" aria-hidden />
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <section aria-labelledby="admin-systems-heading">
        <h2 id="admin-systems-heading" className="text-base font-semibold">
          {viewer.isSuperAdmin ? "Systems" : "HR Operations"}
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

      {viewer.isSuperAdmin && overview.data && (
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-end justify-between gap-3 border-b pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Audit trail
              </p>
              <h2 className="mt-1 text-lg font-semibold">Recent system access activities</h2>
            </div>
            <Link
              to="/profile"
              search={{ portal: undefined, tab: "system-access" }}
              className="text-sm font-medium text-primary hover:underline"
            >
              Manage access
            </Link>
          </div>
          {overview.data.recentAccess.length ? (
            <ul className="mt-3 divide-y">
              {overview.data.recentAccess.slice(0, 6).map((activity, index) => (
                <li key={`${activity.happenedAt}-${index}`} className="flex min-w-0 gap-3 py-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{activity.actorName}</span>{" "}
                      <span className="text-muted-foreground">
                        {activity.action === "granted" ? "granted" : "revoked"}{" "}
                        {activity.roleKey.replace("_", " ")} access
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {activity.targetEmail} · {formatActivityDate(activity.happenedAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No access changes have been recorded.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function OverviewCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        <span className="text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ModuleMetric({
  label,
  counts,
}: {
  label: string;
  counts: { pending: number; completed: number; rejected: number };
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="truncate text-sm font-medium">{label}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <dd className="text-lg font-semibold tabular-nums">{counts.pending}</dd>
          <dt className="text-[11px] text-muted-foreground">Pending</dt>
        </div>
        <div>
          <dd className="text-lg font-semibold tabular-nums">{counts.completed}</dd>
          <dt className="text-[11px] text-muted-foreground">Completed</dt>
        </div>
        <div>
          <dd className="text-lg font-semibold tabular-nums">{counts.rejected}</dd>
          <dt className="text-[11px] text-muted-foreground">Rejected</dt>
        </div>
      </dl>
    </div>
  );
}

function initials(name: string) {
  return name
    .replace(/^(Mr\.|Ms\.|Mrs\.|Mx\.|Dr\.|Atty\.)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatActivityDate(value: string) {
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
