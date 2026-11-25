import { useDeferredValue, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/app/PageHeader";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { CoeRequestTable } from "@/components/hrdo/CoeRequestTable";
import { listAllCoeRequestsFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
import {
  COE_COPY_TYPE_LABELS,
  COE_COPY_TYPES,
  COE_STATUS_LABELS,
  COE_STATUSES,
  coeDepartments,
  filterCoeRequests,
  hrCoeSummary,
  type CoeCopyType,
  type CoeDeadlineFilter,
  type CoeStatus,
} from "@/lib/hrdo";
import { SITE } from "@/lib/site";

const PAGE = 15;

export const Route = createFileRoute("/hrdo/requests")({
  head: () => ({
    meta: [
      { title: `COE Requests — ${SITE.name}` },
      {
        name: "description",
        content: "Search and filter every Certificate of Employment request.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CoeRequestsPage,
});

function CoeRequestsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<CoeStatus | "all">("all");
  const [department, setDepartment] = useState("all");
  const [deadline, setDeadline] = useState<CoeDeadlineFilter>("all");
  const [copyType, setCopyType] = useState<CoeCopyType | "all">("all");
  const [page, setPage] = useState(0);
  const deferredQ = useDeferredValue(q);

  const requests = useQuery({
    queryKey: ["coe", "all"],
    queryFn: () => unwrap(listAllCoeRequestsFn()),
    staleTime: 10_000,
  });

  const rows = requests.data ?? [];
  const summary = hrCoeSummary(rows);
  const departments = coeDepartments(rows);
  const filtered = filterCoeRequests(rows, {
    q: deferredQ,
    status,
    department,
    deadline,
    copyType,
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages - 1);
  const activeFilters =
    Boolean(q.trim()) ||
    status !== "all" ||
    department !== "all" ||
    deadline !== "all" ||
    copyType !== "all";

  function resetFilters() {
    setQ("");
    setStatus("all");
    setDepartment("all");
    setDeadline("all");
    setCopyType("all");
    setPage(0);
  }

  return (
    <>
      <PageHeader
        title="COE Requests"
        description={`${rows.length} request${rows.length === 1 ? "" : "s"} · ${summary.overdue} overdue · ${summary.dueSoon} due soon`}
      />

      <Section title="All requests">
        <div className="mb-4 rounded-lg border bg-muted/20 p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="size-4 text-primary" aria-hidden />
            Find a request
          </div>
          <label
            htmlFor="coe-request-search"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Search
          </label>
          <div className="relative mb-4 max-w-xl">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="coe-request-search"
              className="h-10 bg-background pl-9 shadow-none"
              placeholder="Name, employee ID, or request ID"
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(0);
              }}
              maxLength={100}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label
                htmlFor="coe-status-filter"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                Status
              </label>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as CoeStatus | "all");
                  setPage(0);
                }}
              >
                <SelectTrigger
                  id="coe-status-filter"
                  className="h-10 bg-background shadow-none hover:border-primary/40"
                  aria-label="Filter by status"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {COE_STATUSES.map((key) => (
                    <SelectItem key={key} value={key}>
                      {COE_STATUS_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label
                htmlFor="coe-department-filter"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                Department
              </label>
              <Select
                value={department}
                onValueChange={(value) => {
                  setDepartment(value);
                  setPage(0);
                }}
              >
                <SelectTrigger
                  id="coe-department-filter"
                  className="h-10 bg-background shadow-none hover:border-primary/40"
                  aria-label="Filter by department"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label
                htmlFor="coe-deadline-filter"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                Deadline
              </label>
              <Select
                value={deadline}
                onValueChange={(value) => {
                  setDeadline(value as CoeDeadlineFilter);
                  setPage(0);
                }}
              >
                <SelectTrigger
                  id="coe-deadline-filter"
                  className="h-10 bg-background shadow-none hover:border-primary/40"
                  aria-label="Filter by deadline"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any deadline</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="due_soon">Due soon</SelectItem>
                  <SelectItem value="on_track">On track</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label
                htmlFor="coe-copy-filter"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                Copy type
              </label>
              <Select
                value={copyType}
                onValueChange={(value) => {
                  setCopyType(value as CoeCopyType | "all");
                  setPage(0);
                }}
              >
                <SelectTrigger
                  id="coe-copy-filter"
                  className="h-10 bg-background shadow-none hover:border-primary/40"
                  aria-label="Filter by type of copy"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any copy type</SelectItem>
                  {COE_COPY_TYPES.map((key) => (
                    <SelectItem key={key} value={key}>
                      {COE_COPY_TYPE_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">
            {filtered.length} matching request{filtered.length === 1 ? "" : "s"}
          </span>
          {activeFilters && (
            <Button size="sm" variant="outline" onClick={resetFilters}>
              Clear filters
            </Button>
          )}
        </div>

        {requests.isPending ? (
          <LoadingPanel label="Loading COE requests" />
        ) : requests.isError ? (
          <div className="p-6 text-center" role="alert">
            <p className="font-medium">We couldn&apos;t load COE requests.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your connection and try again.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => void requests.refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Try again
            </Button>
          </div>
        ) : (
          <>
            <CoeRequestTable
              requests={filtered.slice(current * PAGE, current * PAGE + PAGE)}
              audience="staff"
              empty={
                activeFilters
                  ? "No COE requests match these filters."
                  : "No COE requests have been submitted yet."
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
  );
}
