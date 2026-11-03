import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { ArrowUpRight, FileBadge, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, Section } from "@/components/app/PageHeader";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { CoeSummaryCards, type CoeSummaryCard } from "@/components/hrdo/CoeSummaryCards";
import { CoeRequestTable } from "@/components/hrdo/CoeRequestTable";
import { CoeHistoryList } from "@/components/hrdo/CoeHistoryList";
import { listAllCoeRequestsFn, listMyCoeRequestsFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
import {
  COE_REQUESTOR_GROUPS,
  COE_REQUESTOR_STATUS_LABELS,
  coeDeadlineInfo,
  coeRequestorCounts,
  filterCoeRequests,
  hrCoeSummary,
  type CoeRequest,
  type CoeStatus,
} from "@/lib/hrdo";
import { SITE } from "@/lib/site";

const PAGE = 10;

export const Route = createFileRoute("/hrdo/dashboard")({
  head: () => ({
    meta: [
      { title: `COE Dashboard — ${SITE.name}` },
      {
        name: "description",
        content: "Manage Certificate of Employment requests, deadlines and releases.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CoeDashboard,
});

function CoeDashboard() {
  const { hrdoViewer } = Route.useRouteContext();
  if (!hrdoViewer) return null;
  return hrdoViewer.role === "hrdo_staff" ? <HrDashboard /> : <RequestorDashboard />;
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

type StaffQueue = "all" | "new" | "review" | "processing" | "due" | "ready";

function staffQueueRows(rows: CoeRequest[], queue: StaffQueue): CoeRequest[] {
  switch (queue) {
    case "all":
      return rows;
    case "new":
      return rows.filter((request) => request.status === "pending");
    case "review":
      return rows.filter((request) => request.status === "under_review");
    case "processing":
      return rows.filter((request) => request.status === "processing");
    case "ready":
      return rows.filter((request) => request.status === "ready_for_pickup");
    case "due":
      return rows
        .filter((request) => {
          const state = coeDeadlineInfo(request.deadlineAt, request.status).state;
          return state === "overdue" || state === "due_soon";
        })
        .sort((a, b) => Date.parse(a.deadlineAt) - Date.parse(b.deadlineAt));
  }
}

function HrDashboard() {
  const [queue, setQueue] = useState<StaffQueue>("all");
  const requests = useQuery({
    queryKey: ["coe", "all"],
    queryFn: () => unwrap(listAllCoeRequestsFn()),
    staleTime: 10_000,
  });

  const rows = requests.data ?? [];
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

  const filtered = staffQueueRows(rows, queue);
  const visible = filtered.slice(0, queue === "all" ? 10 : 50);
  const recentActivity = rows
    .flatMap((request) =>
      request.history.map((entry) => ({ ...entry, employeeName: request.employeeName })),
    )
    .sort((a, b) => Date.parse(b.happenedAt) - Date.parse(a.happenedAt))
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="COE Request Management"
        description="Review requests, monitor deadlines, and manage document releases."
        actions={
          <Button asChild size="lg">
            <Link to="/hrdo/requests">
              <FileBadge className="h-4 w-4" aria-hidden /> Open COE Requests
            </Link>
          </Button>
        }
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
            columns={5}
            activeKey={queue === "all" ? undefined : queue}
            onSelect={(key) =>
              setQueue((current) => (current === key ? "all" : (key as StaffQueue)))
            }
          />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_300px]">
            <Section
              title={
                queue === "all"
                  ? "Latest COE requests"
                  : queue === "due"
                    ? "Requests needing immediate action"
                    : `${cards.find((card) => card.key === queue)?.label ?? "COE requests"}`
              }
              actions={
                <Link
                  to="/hrdo/requests"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View all ({summary.total})
                </Link>
              }
            >
              {requests.isPending ? (
                <LoadingPanel label="Loading COE requests" rows={6} />
              ) : (
                <CoeRequestTable
                  requests={visible}
                  audience="staff"
                  empty={
                    queue === "all"
                      ? "No COE requests have been submitted yet."
                      : "No requests in this group right now."
                  }
                />
              )}
            </Section>

            <Section
              title="Recent activity"
              actions={
                <Link
                  to="/hrdo/history"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Request history
                </Link>
              }
            >
              {requests.isPending ? (
                <LoadingPanel label="Loading recent activity" rows={3} />
              ) : (
                <CoeHistoryList
                  entries={recentActivity}
                  empty="No COE activity has been recorded yet."
                />
              )}
            </Section>
          </div>
        </>
      )}
    </>
  );
}

type RequestorGroupKey = (typeof COE_REQUESTOR_GROUPS)[number]["key"];

function RequestorDashboard() {
  const { hrdoViewer } = Route.useRouteContext();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<CoeStatus | "all">("all");
  const [group, setGroup] = useState<RequestorGroupKey | "all">("all");
  const [page, setPage] = useState(0);
  const deferredQ = useDeferredValue(q);

  const requests = useQuery({
    queryKey: ["coe", "mine"],
    queryFn: () => unwrap(listMyCoeRequestsFn()),
    staleTime: 10_000,
    enabled: Boolean(hrdoViewer),
  });

  if (!hrdoViewer) return null;

  const rows = requests.data ?? [];
  const counts = coeRequestorCounts(rows);
  const activeGroup = COE_REQUESTOR_GROUPS.find((item) => item.key === group);
  const scoped = activeGroup
    ? rows.filter((request) => activeGroup.statuses.includes(request.status))
    : rows;
  const filtered = filterCoeRequests(scoped, { q: deferredQ, status });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE, current * PAGE + PAGE);
  const needsAction = rows.filter((request) => request.status === "correction_requested");

  return (
    <>
      <PageHeader
        title="My COE Requests"
        description="Submit a Certificate of Employment request and track its progress online."
        actions={
          <Button asChild size="lg">
            <Link to="/hrdo/coe">
              <FileBadge className="h-4 w-4" aria-hidden /> New COE Request
            </Link>
          </Button>
        }
      />

      {needsAction.length > 0 && (
        <div
          role="status"
          className="mb-4 flex gap-3 rounded-sm border border-warning/30 bg-warning-soft p-3"
        >
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 space-y-1 text-sm">
            <p className="font-semibold">
              {needsAction.length === 1
                ? "1 request needs your action"
                : `${needsAction.length} requests need your action`}
            </p>
            {needsAction.slice(0, 2).map((request) => (
              <p key={request.id} className="break-words">
                {request.correctionMessage || "HRDO requested a correction."}{" "}
                <Link
                  to="/hrdo/coe/$id"
                  params={{ id: request.id }}
                  className="whitespace-nowrap font-medium text-primary hover:underline"
                >
                  Open request <ArrowUpRight className="inline h-3 w-3" aria-hidden />
                </Link>
              </p>
            ))}
          </div>
        </div>
      )}

      {requests.isError ? (
        <LoadError
          message="Check your connection and try again. If this continues, contact HRDO."
          onRetry={() => void requests.refetch()}
        />
      ) : (
        <>
          <CoeSummaryCards
            label="My COE request summary"
            loading={requests.isPending}
            cards={COE_REQUESTOR_GROUPS.map((item) => ({
              key: item.key,
              label: item.label,
              value: counts[item.key],
              hint: item.hint,
            }))}
            activeKey={group === "all" ? undefined : group}
            onSelect={(key) => {
              setGroup((current) => (current === key ? "all" : (key as RequestorGroupKey)));
              setPage(0);
            }}
          />

          <Section
            title={activeGroup ? activeGroup.label : "My COE Requests"}
            actions={
              <Link to="/hrdo/coe" className="text-sm font-medium text-primary hover:underline">
                New request
              </Link>
            }
          >
            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <Input
                aria-label="Search COE requests"
                placeholder="Search by request ID or purpose…"
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setPage(0);
                }}
                maxLength={100}
                className="sm:max-w-xs"
              />
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as CoeStatus | "all");
                  setPage(0);
                }}
              >
                <SelectTrigger className="sm:w-56" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {(Object.keys(COE_REQUESTOR_STATUS_LABELS) as CoeStatus[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {COE_REQUESTOR_STATUS_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {requests.isPending ? (
              <LoadingPanel label="Loading COE requests" rows={6} />
            ) : (
              <>
                <CoeRequestTable
                  requests={visible}
                  audience="requestor"
                  empty={
                    q.trim() || status !== "all" || activeGroup
                      ? "No COE requests match your filters."
                      : "You haven't submitted a COE request yet."
                  }
                />
                {pages > 1 && (
                  <div className="mt-3 flex items-center justify-end gap-2 text-sm">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={current === 0}
                      onClick={() => setPage(current - 1)}
                    >
                      Previous
                    </Button>
                    <span>
                      Page {current + 1} of {pages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={current >= pages - 1}
                      onClick={() => setPage(current + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </Section>
        </>
      )}
    </>
  );
}
