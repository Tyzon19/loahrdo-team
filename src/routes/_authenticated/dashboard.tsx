import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CheckCircle2, FilePlus2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/app/PageHeader";
import { RequestsTable } from "@/components/app/RequestsTable";
import { StatsCards } from "@/components/app/StatsCards";
import { AdminAnalytics } from "@/components/app/AdminAnalytics";
import { LoadingPanel, LoadingScreen } from "@/components/app/LoadingPanel";
import { dashboardStatsFn, listNotificationsFn, listRequestsFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
import { ROLE_TITLES, STAGES } from "@/lib/workflow";
import { SITE } from "@/lib/site";
import type { EmailMessage } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: `Dashboard  ${SITE.name}` },
      { name: "description", content: "Your vehicle request overview and pending actions." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Dashboard,
});
function Dashboard() {
  const { viewer } = Route.useRouteContext();
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => unwrap(dashboardStatsFn()),
    staleTime: 15_000,
  });
  const requests = useQuery({
    queryKey: ["requests", "all"],
    queryFn: () => unwrap(listRequestsFn({ data: { status: "all", q: "" } })),
    staleTime: 15_000,
  });
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => unwrap(listNotificationsFn()),
    enabled: viewer?.role === "requisitioner",
  });

  if (!viewer) return null;

  const rows = requests.data ?? [];
  const pending = rows.filter((row) => row.status.startsWith("pending_"));
  const returned = rows.filter((row) => row.status === "returned");
  const errored = requests.isError || stats.isError;
  const myStage = STAGES.find((stage) => stage.role === viewer.role);
  const myQueue = myStage ? pending.filter((row) => row.status === myStage.status) : [];

  const header = (
    <PageHeader
      title={
        viewer.role === "requisitioner"
          ? `Welcome, ${viewer.name.split(" ")[0]}`
          : viewer.role === "president"
            ? "Requests awaiting your final approval"
            : viewer.role === "admin"
              ? "System monitoring dashboard"
              : `${ROLE_TITLES[viewer.role]} dashboard`
      }
      description={
        viewer.role === "requisitioner"
          ? "Request a school vehicle and follow every approval."
          : viewer.role === "admin"
            ? "Monitor system-wide requests, vehicle activity, and trip trends."
            : `${ROLE_TITLES[viewer.role]} · ${rows.length} request${rows.length === 1 ? "" : "s"} visible`
      }
      actions={
        viewer.role === "requisitioner" ? (
          <Button asChild size="lg">
            <Link to="/requests/new">
              <FilePlus2 className="h-4 w-4" aria-hidden /> New Vehicle Request
            </Link>
          </Button>
        ) : undefined
      }
    />
  );

  if (errored) {
    return (
      <>
        {header}
        <div className="panel p-6 text-center" role="alert">
          <p className="font-medium">We couldn&apos;t load your dashboard.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Check your connection and try again. If this continues, contact PFMO.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => {
              void requests.refetch();
              void stats.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </Button>
        </div>
      </>
    );
  }

  if (stats.isPending || requests.isPending) {
    return <LoadingScreen label="Loading dashboard" mode="overlay" />;
  }

  return (
    <>
      {header}
      {viewer.role === "requisitioner" && (
        <ApprovalNotices
          items={(notifications.data ?? []).filter(
            (item) => item.kind === "approved_requester" && !item.read,
          )}
          isLoading={notifications.isPending}
          hasError={notifications.isError}
        />
      )}
      <StatsCards stats={stats.data} loading={stats.isPending} role={viewer.role} />

      {viewer.role === "admin" && <AdminAnalytics />}
      {viewer.role === "requisitioner" ? (
        <div className="space-y-4">
          {returned.length > 0 && (
            <Section title="Returned — action needed from you">
              <RequestsTable rows={returned} />
            </Section>
          )}
          <Section
            title="Recent requests"
            actions={
              <Link to="/requests" className="text-sm text-primary hover:underline">
                View all
              </Link>
            }
          >
            {requests.isPending ? (
              <LoadingPanel label="Loading your requests" />
            ) : (
              <RequestsTable
                rows={rows.slice(0, 6)}
                empty="You haven't submitted any requests yet."
              />
            )}
          </Section>
        </div>
      ) : (
        <div className="space-y-4">
          {myStage && (
            <Section title={`Waiting for you (${myQueue.length})`}>
              {requests.isPending ? (
                <LoadingPanel label="Loading your approval queue" />
              ) : (
                <RequestsTable
                  rows={myQueue}
                  showRequester
                  empty="Nothing is waiting for your signature."
                />
              )}
            </Section>
          )}
          <Section
            title={viewer.role === "admin" ? "System-wide recent requests" : "Recent requests"}
          >
            {requests.isPending ? (
              <LoadingPanel label="Loading recent requests" />
            ) : (
              <RequestsTable rows={rows.slice(0, 8)} showRequester empty="No requests yet." />
            )}
          </Section>
        </div>
      )}
    </>
  );
}

function ApprovalNotices({
  items,
  isLoading,
  hasError,
}: {
  items: EmailMessage[];
  isLoading: boolean;
  hasError: boolean;
}) {
  if (isLoading) return null;
  if (hasError) {
    return (
      <div
        className="mb-4 rounded-md border border-destructive/30 bg-danger-soft p-3 text-sm"
        role="alert"
      >
        We couldn&apos;t load your approval messages. Open Notifications to check for updates.
      </div>
    );
  }
  if (!items.length) return null;

  return (
    <section
      className="mb-4 overflow-hidden rounded-lg border border-success/25 bg-success-soft/50"
      aria-labelledby="approved-trip-tickets"
    >
      <div className="flex items-center gap-2 border-b border-success/20 px-3 py-2.5 sm:px-4">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
        <h2 id="approved-trip-tickets" className="text-sm font-semibold text-success">
          Trip ticket approved
        </h2>
      </div>
      <ul className="divide-y divide-success/15">
        {items.slice(0, 3).map((item) => (
          <li
            key={item.id}
            className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
          >
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold">{item.heading}</p>
              <p className="mt-0.5 break-words text-xs text-muted-foreground">{item.body}</p>
            </div>
            <Button asChild size="sm" variant="outline" className="w-full shrink-0 sm:w-auto">
              <Link to="/print/$id" params={{ id: item.requestId }}>
                View trip ticket <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
