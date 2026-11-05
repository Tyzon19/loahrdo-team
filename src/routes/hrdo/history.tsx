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
import { CoeHistoryList } from "@/components/hrdo/CoeHistoryList";
import { listCoeHistoryFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
import { COE_HISTORY_LABELS, type CoeHistoryType } from "@/lib/hrdo";
import { SITE } from "@/lib/site";

const PAGE = 25;

export const Route = createFileRoute("/hrdo/history")({
  beforeLoad: () => {
    throw redirect({ to: "/hrdo/dashboard" });
  },
  head: () => ({
    meta: [
      { title: `COE Request History — ${SITE.name}` },
      {
        name: "description",
        content: "Digital record of COE submissions, corrections, releases and deadlines.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CoeHistoryPage,
});

function CoeHistoryPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState<CoeHistoryType | "all">("all");
  const [page, setPage] = useState(0);
  const deferredQ = useDeferredValue(q);

  const history = useQuery({
    queryKey: ["coe", "history"],
    queryFn: () => unwrap(listCoeHistoryFn()),
    staleTime: 10_000,
  });

  const query = deferredQ.trim().toLowerCase();
  const rows = (history.data ?? []).filter((entry) => {
    if (type !== "all" && entry.type !== type) return false;
    if (!query) return true;
    return (
      entry.message.toLowerCase().includes(query) ||
      entry.actorName.toLowerCase().includes(query) ||
      entry.employeeName.toLowerCase().includes(query) ||
      entry.employeeNumber.toLowerCase().includes(query) ||
      entry.requestId.toLowerCase().includes(query)
    );
  });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Request History"
        description="Every submitted request, correction, release and deadline action in one paperless record."
      />
      <Section title="Activity">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Search request history"
            placeholder="Search employee, request ID or action…"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(0);
            }}
            maxLength={100}
            className="sm:max-w-sm"
          />
          <Select
            value={type}
            onValueChange={(value) => {
              setType(value as CoeHistoryType | "all");
              setPage(0);
            }}
          >
            <SelectTrigger className="sm:w-64" aria-label="Filter by action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {(Object.keys(COE_HISTORY_LABELS) as CoeHistoryType[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {COE_HISTORY_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {history.isPending ? (
          <LoadingPanel label="Loading request history" rows={8} />
        ) : history.isError ? (
          <div className="p-6 text-center" role="alert">
            <p className="font-medium">We couldn&apos;t load the request history.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your connection and try again.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => void history.refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Try again
            </Button>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              {rows.length} recorded action{rows.length === 1 ? "" : "s"}
            </p>
            <CoeHistoryList
              entries={rows.slice(current * PAGE, current * PAGE + PAGE)}
              showRequest
              empty={
                query || type !== "all"
                  ? "No history entries match your filters."
                  : "No COE activity has been recorded yet."
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
    </div>
  );
}
