import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { RequestRow } from "@/lib/types";
import { fmtDate, fmtRange } from "@/lib/format";
import { pendingWith } from "@/lib/workflow";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./PageHeader";
export function RequestsTable({
  rows,
  empty = "No requests to show.",
  showRequester = false,
}: {
  rows: RequestRow[];
  empty?: string;
  showRequester?: boolean;
}) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <>
      <ul className="grid gap-2 sm:grid-cols-2 lg:hidden">
        {rows.map((request) => (
          <li key={request.id} className="min-w-0 rounded-md border bg-card p-3">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">Request No.</p>
                <Link
                  to="/requests/$id"
                  params={{ id: request.id }}
                  className="break-words text-sm font-semibold text-primary hover:underline"
                >
                  {request.number}
                </Link>
              </div>
              <StatusBadge status={request.status} />
            </div>
            {showRequester && (
              <p className="mt-2 break-words text-xs text-muted-foreground">
                Requested by {request.requisitionerName}
              </p>
            )}
            <dl className="mt-2 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div className="col-span-2 min-w-0">
                <dt className="text-[10px] text-muted-foreground">Destination</dt>
                <dd className="break-words">{request.destinations.join("; ")}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] text-muted-foreground">Travel dates</dt>
                <dd className="break-words">{fmtRange(request.dateStart, request.dateEnd)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] text-muted-foreground">Submitted</dt>
                <dd className="break-words">{fmtDate(request.submittedAt)}</dd>
              </div>
            </dl>

            <Link
              to="/requests/$id"
              params={{ id: request.id }}
              className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View details <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden lg:block">
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-[1060px] w-full table-fixed border-separate border-spacing-0 text-sm">
            <thead className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-foreground/75">
              <tr>
                <th className="w-[140px] px-3 py-2 font-medium text-foreground/80">Request No.</th>
                <th className="w-[115px] px-3 py-2 font-medium text-foreground/80">Submitted</th>
                {showRequester && (
                  <th className="w-[155px] px-3 py-2 font-medium text-foreground/80">Requestor</th>
                )}
                <th className="w-[180px] px-3 py-2 font-medium text-foreground/80">Destination</th>
                <th className="w-[180px] px-3 py-2 font-medium text-foreground/80">Travel Dates</th>
                <th className="w-[195px] px-3 py-2 font-medium text-foreground/80">Status</th>
                <th className="w-[175px] px-3 py-2 font-medium text-foreground/80">Pending With</th>
                <th className="w-[120px] px-3 py-2">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 align-top hover:bg-muted/60">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    <Link
                      to="/requests/$id"
                      params={{ id: r.id }}
                      className="text-primary hover:underline"
                    >
                      {r.number}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    {fmtDate(r.submittedAt)}
                  </td>
                  {showRequester && (
                    <td className="px-3 py-2 font-medium break-words">{r.requisitionerName}</td>
                  )}
                  <td
                    className="px-3 py-2 font-medium break-words [overflow-wrap:anywhere]"
                    title={r.destinations.join("; ")}
                  >
                    {r.destinations.join("; ")}
                  </td>
                  <td className="px-3 py-2 font-medium whitespace-normal break-words">
                    {fmtRange(r.dateStart, r.dateEnd)}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2 break-words [overflow-wrap:anywhere] text-foreground/80">
                    {pendingWith(r.status)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                    <Link
                      to="/requests/$id"
                      params={{ id: r.id }}
                      className="whitespace-nowrap text-primary hover:underline"
                    >
                      View details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
