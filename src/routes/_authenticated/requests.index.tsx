import { useDeferredValue, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { RequestsTable } from "@/components/app/RequestsTable";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { listRequestsFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
import { STATUS_LABELS } from "@/lib/workflow";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/requests/")({
  head: () => ({
    meta: [
      { title: `Requests — ${SITE.name}` },
      { name: "description", content: "Search and filter vehicle reservation requests." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RequestsList,
});

const PAGE = 10;

function RequestsList() {
  const { viewer } = Route.useRouteContext();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const deferredQ = useDeferredValue(q);
  const mineOnly = viewer?.role === "requisitioner";

  const requests = useQuery({
    queryKey: ["requests", "list", deferredQ, status],
    queryFn: () => unwrap(listRequestsFn({ data: { q: deferredQ, status } })),
    staleTime: 10_000,
  });

  const rows = requests.data ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);

  return (
    <>
      <PageHeader
        title={mineOnly ? "My Requests" : "All Requests"}
        description={`${rows.length} request${rows.length === 1 ? "" : "s"}${
          mineOnly ? " · only requests you filed are shown" : ""
        }`}
      />
      <Section title="Requests">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Search requests"
            placeholder="Search by number, destination, purpose…"
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
              setStatus(value);
              setPage(0);
            }}
          >
            <SelectTrigger className="sm:w-56" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {requests.isPending ? (
          <LoadingPanel label="Loading requests" />
        ) : requests.isError ? (
          <div className="panel p-6 text-center" role="alert">
            <p className="font-medium">We couldn&apos;t load requests.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your connection and try again.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => void requests.refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Try again
            </Button>
          </div>
        ) : (
          <>
            <div className="-mx-4 border-t">
              <RequestsTable
                rows={rows.slice(current * PAGE, current * PAGE + PAGE)}
                showRequester={!mineOnly}
                empty={
                  deferredQ || status !== "all"
                    ? "No requests match your search."
                    : "No requests yet."
                }
              />
            </div>
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
