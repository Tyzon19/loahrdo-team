import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { VehicleRequest } from "@/lib/types";
import { fmtDate, fmtRange } from "@/lib/format";
import { pendingWith } from "@/lib/workflow";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./PageHeader";
export function RequestsTable({
  rows,
  empty = "No requests to show.",
  showRequester = false,
}: {
  rows: VehicleRequest[];
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
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Request No.</th>
              <th className="px-3 py-2 font-medium">Submitted</th>
              {showRequester && <th className="px-3 py-2 font-medium">Requisitioner</th>}
              <th className="px-3 py-2 font-medium">Destination</th>
              <th className="px-3 py-2 font-medium">Travel Dates</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Pending With</th>
              <th className="px-3 py-2">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/60">
                <td className="px-3 py-2 font-medium">
                  <Link
                    to="/requests/$id"
                    params={{ id: r.id }}
                    className="text-primary hover:underline"
                  >
                    {r.number}
                  </Link>
                </td>
                <td className="font-medium">{fmtDate(r.submittedAt)}</td>
                {showRequester && <td className="px-3 py-2 font-medium">{r.requisitionerName}</td>}
                <td
                  className="max-w-[220px] truncate px-3 py-2 font-medium"
                  title={r.destinations.join("; ")}
                >
                  {r.destinations.join("; ")}
                </td>
                <td className="px-3 py-2 font-medium">{fmtRange(r.dateStart, r.dateEnd)}</td>
                <td className="px-3 py-2 font-medium">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-3 py-2 text-muted-foreground">{pendingWith(r.status)}</td>
                <td className="px-3 py-2 text-right font-medium">
                  <Link
                    to="/requests/$id"
                    params={{ id: r.id }}
                    className="text-primary hover:underline"
                  >
                    View details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
