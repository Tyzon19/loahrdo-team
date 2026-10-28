import { useDeferredValue, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
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
  beforeLoad: ({ context }) => {
    if (context.hrdoViewer && context.hrdoViewer.role !== "hrdo_staff") {
      throw redirect({ to: "/hrdo/dashboard" });
    }
  },
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
        <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <Input
            aria-label="Search COE requests"
            placeholder="Search name, Employee ID, request ID…"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(0);
            }}
            maxLength={100}
          />
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as CoeStatus | "all");
              setPage(0);
            }}
          >
            <SelectTrigger aria-label="Filter by status">
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
          <Select
            value={department}
            onValueChange={(value) => {
              setDepartment(value);
              setPage(0);
            }}
          >
            <SelectTrigger aria-label="Filter by department">
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
          <Select
            value={deadline}
            onValueChange={(value) => {
              setDeadline(value as CoeDeadlineFilter);
              setPage(0);
            }}
          >
            <SelectTrigger aria-label="Filter by deadline">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any deadline</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="due_soon">Due soon</SelectItem>
              <SelectItem value="on_track">On track</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={copyType}
            onValueChange={(value) => {
              setCopyType(value as CoeCopyType | "all");
              setPage(0);
            }}
          >
            <SelectTrigger aria-label="Filter by type of copy">
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

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {filtered.length} matching request{filtered.length === 1 ? "" : "s"}
            {deadline !== "all" ? " · three-day HR policy deadline" : ""}
          </span>
          {activeFilters && (
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={resetFilters}>
              Clear filters
            </Button>
          )}
        </div>

        {requests.isPending ? (
          <LoadingPanel label="Loading COE requests" rows={8} />
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
