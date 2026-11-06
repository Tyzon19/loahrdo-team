import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { FileBadge, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { PageHeader, Section } from "@/components/app/PageHeader";
import { CoeSummaryCards, type CoeSummaryCard } from "@/components/hrdo/CoeSummaryCards";
import { CoeRequestTable } from "@/components/hrdo/CoeRequestTable";
import {
  listAllCoeRequestsFn,
  searchStaffCoeRequestsFn,
} from "@/server-functions";
import { unwrap } from "@/lib/api";
import { hrCoeSummary, isHrdoStaffRole } from "@/lib/hrdo";
import { SITE } from "@/lib/site";

const PAGE = 10;

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
        content: "Manage Certificate of Employment requests, deadlines and releases.",
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

type StaffQueue = "all" | "new" | "review" | "processing" | "awaiting_review" | "due" | "ready";
type StaffRequestSort =
  | "priority"
  | "date_newest"
  | "date_oldest"
  | "requestor_asc"
  | "requestor_desc"
  | "department_asc"
  | "department_desc"
  | "id_asc"
  | "id_desc";

function HrDashboard() {
  const [queue, setQueue] = useState<StaffQueue>("all");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [lastHandledBy, setLastHandledBy] = useState("");
  const [handling, setHandling] = useState<"all" | "no_action">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<StaffRequestSort>("priority");
  const [page, setPage] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const requests = useQuery({
    queryKey: ["coe", "all"],
    queryFn: () => unwrap(listAllCoeRequestsFn()),
    staleTime: 10_000,
  });
  const searchResults = useQuery({
    queryKey: [
      "coe",
      "staff-search",
      queue,
      deferredQuery,
      department,
      lastHandledBy,
      handling,
      dateFrom,
      dateTo,
      sort,
      page,
    ],
    queryFn: () =>
      unwrap(
        searchStaffCoeRequestsFn({
          data: {
            queue,
            query: deferredQuery,
            department,
            lastHandledBy,
            handling,
            dateFrom,
            dateTo,
            sort,
            page,
          },
        }),
      ),
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

  const visible = searchResults.data?.requests ?? [];
  const totalMatches = searchResults.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(totalMatches / PAGE));
  const currentPage = Math.min(page, pages - 1);
  const activeFilters =
    Boolean(query.trim()) ||
    Boolean(department.trim()) ||
    Boolean(lastHandledBy.trim()) ||
    handling !== "all" ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    sort !== "priority";
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
            columns={6}
            activeKey={queue === "all" ? undefined : queue}
            onSelect={(key) => {
              setQueue((current) => (current === key ? "all" : (key as StaffQueue)));
              setPage(0);
            }}
          />

          <Section
            title={
              queue === "all"
                ? "COE requests"
                : (cards.find((card) => card.key === queue)?.label ?? "COE requests")
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
            <div className="mb-4 rounded-lg border bg-muted/20 p-3 sm:p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground md:col-span-2 xl:col-span-2">
                  Search requests
                  <Input
                    aria-label="Search COE requests"
                    placeholder="Requestor, department, date, or request ID"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(0);
                    }}
                    maxLength={100}
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Department
                  <Input
                    aria-label="Filter by department"
                    placeholder="All departments"
                    value={department}
                    onChange={(event) => {
                      setDepartment(event.target.value);
                      setPage(0);
                    }}
                    maxLength={120}
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Last handled by
                  <Input
                    aria-label="Filter by last HRDO handler"
                    placeholder="Any staff member"
                    value={lastHandledBy}
                    onChange={(event) => {
                      setLastHandledBy(event.target.value);
                      setHandling("all");
                      setPage(0);
                    }}
                    maxLength={120}
                  />
                </label>
                <div className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  <span>HRDO activity</span>
                  <Select
                    value={handling}
                    onValueChange={(value) => {
                      const nextHandling = value as "all" | "no_action";
                      setHandling(nextHandling);
                      if (nextHandling === "no_action") setLastHandledBy("");
                      setPage(0);
                    }}
                  >
                    <SelectTrigger aria-label="Filter by HRDO handling activity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All requests</SelectItem>
                      <SelectItem value="no_action">No action yet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Requested from
                  <Input
                    aria-label="Requests from date"
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(event) => {
                      setDateFrom(event.target.value);
                      setPage(0);
                    }}
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Requested through
                  <Input
                    aria-label="Requests through date"
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(event) => {
                      setDateTo(event.target.value);
                      setPage(0);
                    }}
                  />
                </label>
                <div className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  <span>Sort requests</span>
                  <Select
                    value={sort}
                    onValueChange={(value) => {
                      setSort(value as StaffRequestSort);
                      setPage(0);
                    }}
                  >
                    <SelectTrigger aria-label="Sort COE requests">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priority">Priority / due date</SelectItem>
                      <SelectItem value="date_newest">Request date: newest first</SelectItem>
                      <SelectItem value="date_oldest">Request date: oldest first</SelectItem>
                      <SelectItem value="requestor_asc">Requestor: A to Z</SelectItem>
                      <SelectItem value="requestor_desc">Requestor: Z to A</SelectItem>
                      <SelectItem value="department_asc">Department: A to Z</SelectItem>
                      <SelectItem value="department_desc">Department: Z to A</SelectItem>
                      <SelectItem value="id_asc">Request ID: A to Z</SelectItem>
                      <SelectItem value="id_desc">Request ID: Z to A</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {totalMatches} matching request{totalMatches === 1 ? "" : "s"}
              </span>
              {activeFilters && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => {
                    setQuery("");
                    setDepartment("");
                    setLastHandledBy("");
                    setHandling("all");
                    setDateFrom("");
                    setDateTo("");
                    setSort("priority");
                    setPage(0);
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>

              {requests.isPending || searchResults.isPending ? (
                <LoadingPanel label="Loading COE requests" rows={6} />
              ) : searchResults.isError ? (
                <LoadError
                  message="Check your connection and try again."
                  onRetry={() => void searchResults.refetch()}
                />
              ) : (
                <>
                  <CoeRequestTable
                    requests={visible}
                    audience="staff"
                    empty={
                      activeFilters || queue !== "all"
                        ? "No COE requests match these filters."
                        : "No COE requests have been submitted yet."
                    }
                  />
                  {pages > 1 && (
                    <div className="mt-3 flex items-center justify-end gap-2 text-sm">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={currentPage === 0}
                        onClick={() => setPage(currentPage - 1)}
                      >
                        Previous
                      </Button>
                      <span>
                        Page {currentPage + 1} of {pages}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={currentPage >= pages - 1}
                        onClick={() => setPage(currentPage + 1)}
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
