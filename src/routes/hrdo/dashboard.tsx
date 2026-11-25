import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { EmptyState, PageHeader, Section } from "@/components/app/PageHeader";
import { CoeSummaryCards, type CoeSummaryCard } from "@/components/hrdo/CoeSummaryCards";
import { CoeDeadlineBadge } from "@/components/hrdo/CoeDeadline";
import { CoeStatusBadge } from "@/components/hrdo/CoeStatusBadge";
import { listAllCoeRequestsFn, searchStaffCoeRequestsFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
import { coeReference, hrCoeSummary, isHrdoStaffRole, type CoeRequest } from "@/lib/hrdo";
import { SITE } from "@/lib/site";

const PRIORITY_PREVIEW = 5;

export const Route = createFileRoute("/hrdo/dashboard")({
  beforeLoad: ({ context }) => {
    if (context.hrdoViewer?.role === "employee") {
      throw redirect({ to: "/hrdo/coe" });
    }
  },
  head: () => ({
    meta: [
      { title: `COE Dashboard — ${SITE.name}` },
      {
        name: "description",
        content: "Monitor COE workload and requests needing attention.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CoeDashboard,
});

function CoeDashboard() {
  const { hrdoViewer } = Route.useRouteContext();
  if (!isHrdoStaffRole(hrdoViewer?.role)) return null;
  return <HrDashboard />;
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="panel p-6 text-center" role="alert">
      <p className="font-medium">We couldn&apos;t load COE requests.</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button className="mt-4" variant="outline" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" aria-hidden /> Try again
      </Button>
    </div>
  );
}

function HrDashboard() {
  const requests = useQuery({
    queryKey: ["coe", "all"],
    queryFn: () => unwrap(listAllCoeRequestsFn()),
    staleTime: 10_000,
  });
  const priorityRequests = useQuery({
    queryKey: ["coe", "staff-search", "dashboard-priority"],
    queryFn: () => unwrap(searchStaffCoeRequestsFn({ data: { queue: "due", page: 0 } })),
    staleTime: 10_000,
  });

  const rows = requests.data ?? [];
  const priorityItems = (priorityRequests.data?.requests ?? []).slice(0, PRIORITY_PREVIEW);
  const summary = hrCoeSummary(rows);
  const cards: CoeSummaryCard[] = [
    {
      key: "new",
      label: "New Requests",
      value: summary.newCount,
      hint: "Submitted, not yet reviewed",
    },
    {
      key: "review",
      label: "Under Review",
      value: summary.underReview,
      hint: "Verifying employee information",
    },
    {
      key: "processing",
      label: "Under Processing",
      value: summary.processing,
      hint: "COE being prepared",
    },
    {
      key: "awaiting_review",
      label: "Awaiting Requestor Review",
      value: summary.awaitingReview,
      hint: "Filled Word template sent",
    },
    {
      key: "due",
      label: "Due Soon / Overdue",
      value: summary.dueSoon + summary.overdue,
      hint: `${summary.overdue} overdue · three-day deadline`,
      tone: summary.overdue > 0 ? "danger" : summary.dueSoon > 0 ? "warning" : "default",
    },
    {
      key: "ready",
      label: "Ready for Pickup",
      value: summary.readyForPickup,
      hint: "Originals waiting to be claimed",
      tone: "success",
    },
  ];

  return (
    <>
      <PageHeader
        title="COE Dashboard"
        description="Workload overview and requests needing attention."
      />

      {requests.isError ? (
        <LoadError
          message="Check your connection and try again."
          onRetry={() => void requests.refetch()}
        />
      ) : (
        <>
          <CoeSummaryCards
            label="COE workload summary"
            cards={cards}
            loading={requests.isPending}
            columns={6}
          />

          <Section
            title="Needs attention"
            actions={
              <Link
                to="/hrdo/requests"
                className="text-sm font-medium text-primary hover:underline"
              >
                View all {summary.total} requests
              </Link>
            }
          >
            <p className="mb-3 text-sm text-muted-foreground">
              Overdue and requests due within 24 hours.
            </p>
            {requests.isPending || priorityRequests.isPending ? (
              <LoadingPanel label="Loading requests needing attention" />
            ) : priorityRequests.isError ? (
              <LoadError
                message="Check your connection and try again."
                onRetry={() => void priorityRequests.refetch()}
              />
            ) : priorityItems.length === 0 ? (
              <EmptyState title="No requests need immediate attention." />
            ) : (
              <ul className="divide-y">
                {priorityItems.map((request: CoeRequest) => (
                  <li
                    key={request.id}
                    className="flex min-w-0 flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium">{request.employeeName}</p>
                      <p className="mt-1 break-words text-sm text-muted-foreground">
                        {request.department || "—"} · {coeReference(request.id)}
                      </p>
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                        {request.purpose}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CoeDeadlineBadge deadlineAt={request.deadlineAt} status={request.status} />
                      <CoeStatusBadge status={request.status} audience="staff" />
                    </div>
                    <Link
                      to="/hrdo/coe/$id"
                      params={{ id: request.id }}
                      className="inline-flex min-h-11 items-center gap-1 self-start font-medium text-primary hover:underline sm:self-auto"
                    >
                      Review <ArrowUpRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </>
  );
}
