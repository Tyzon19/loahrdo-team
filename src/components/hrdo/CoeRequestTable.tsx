import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { EmptyState } from "@/components/app/PageHeader";
import { CoeStatusBadge } from "./CoeStatusBadge";
import { CoeDeadlineBadge } from "./CoeDeadline";
import { COE_COPY_TYPE_LABELS, coeReference, type CoeRequest } from "@/lib/hrdo";
import { fmtDate } from "@/lib/format";

/** Request table: full HR columns for staff, a lighter set for employees. */
export function CoeRequestTable({
  requests,
  audience,
  empty,
}: {
  requests: CoeRequest[];
  audience: "staff" | "requestor";
  empty: string;
}) {
  if (!requests.length) return <EmptyState title={empty} />;
  const staff = audience === "staff";

  return (
    <>
      <ul className="grid gap-2 sm:grid-cols-2 lg:hidden">
        {requests.map((request) => (
          <li key={request.id} className="min-w-0 rounded-md border bg-card p-3">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">Request ID</p>
                <p className="break-words font-mono text-xs font-semibold" title={request.id}>
                  {coeReference(request.id)}
                </p>
              </div>
              <CoeStatusBadge status={request.status} audience={audience} />
            </div>
            {staff && (
              <p className="mt-2 break-words text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{request.employeeName}</span>
                {request.employeeNumber ? ` · ${request.employeeNumber}` : ""}
              </p>
            )}
            <dl className="mt-2 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div className="min-w-0">
                <dt className="text-[10px] text-muted-foreground">Date Requested</dt>
                <dd className="break-words">{fmtDate(request.requestedAt)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] text-muted-foreground">Type of Copy</dt>
                <dd className="break-words">{COE_COPY_TYPE_LABELS[request.copyType]}</dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-[10px] text-muted-foreground">Deadline</dt>
                <dd className="mt-0.5">
                  <CoeDeadlineBadge deadlineAt={request.deadlineAt} status={request.status} />
                </dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-[10px] text-muted-foreground">Purpose</dt>
                <dd className="break-words">{request.purpose}</dd>
              </div>
              {staff && (
                <div className="col-span-2 min-w-0">
                  <dt className="text-[10px] text-muted-foreground">Last handled by</dt>
                  <dd className="break-words">{request.processedByName || "No HRDO action yet"}</dd>
                </div>
              )}
            </dl>
            <Link
              to="/hrdo/coe/$id"
              params={{ id: request.id }}
              className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {staff ? "View / Process" : "View details"}{" "}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden lg:block">
        <div className="overflow-hidden rounded-md border">
          <table className="w-full table-auto border-separate border-spacing-0 text-[12px] sm:text-sm">
            <thead className="border-b bg-muted text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">Request ID</th>
                {staff ? (
                  <>
                    <th className="px-2 py-1.5 font-medium">Requestor</th>
                    <th className="px-2 py-1.5 font-medium">Employee ID</th>
                    <th className="px-2 py-1.5 font-medium">Dept.</th>
                    <th className="px-2 py-1.5 font-medium">Date</th>
                    <th className="px-2 py-1.5 font-medium">Copy</th>
                    <th className="px-2 py-1.5 font-medium">Last handled by</th>
                  </>
                ) : (
                  <>
                    <th className="px-2 py-1.5 font-medium">Date</th>
                    <th className="px-2 py-1.5 font-medium">Purpose</th>
                  </>
                )}
                <th className="px-2 py-1.5 font-medium">Deadline</th>
                <th className="px-2 py-1.5 font-medium">Status</th>
                <th className="px-2 py-1.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-b last:border-0 align-top hover:bg-muted/60">
                  <td className="px-2 py-1.5 font-mono text-[10px] font-medium break-words" title={request.id}>
                    {coeReference(request.id)}
                  </td>
                  {staff ? (
                    <>
                      <td className="px-2 py-1.5 font-medium break-words">
                        <span className="block" title={request.employeeName}>
                          {request.employeeName}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 break-words">{request.employeeNumber || "—"}</td>
                      <td className="px-2 py-1.5 break-words" title={request.department || undefined}>
                        {request.department || "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">{fmtDate(request.requestedAt)}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        {COE_COPY_TYPE_LABELS[request.copyType]}
                      </td>
                      <td className="px-2 py-1.5 break-words">
                        {request.processedByName || "No HRDO action yet"}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="whitespace-nowrap px-2 py-1.5">{fmtDate(request.requestedAt)}</td>
                      <td className="px-2 py-1.5 font-medium break-words" title={request.purpose}>
                        {request.purpose}
                      </td>
                    </>
                  )}
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <CoeDeadlineBadge deadlineAt={request.deadlineAt} status={request.status} />
                  </td>
                  <td className="px-2 py-1.5 font-medium">
                    <CoeStatusBadge status={request.status} audience={audience} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium">
                    <Link
                      to="/hrdo/coe/$id"
                      params={{ id: request.id }}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      {staff ? "View / Process" : "View details"}{" "}
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
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
