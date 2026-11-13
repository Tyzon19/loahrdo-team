import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { EmptyState } from "@/components/app/PageHeader";
import { CoeStatusBadge } from "./CoeStatusBadge";
import { CoeDeadlineBadge } from "./CoeDeadline";
import { Table01 } from "@/components/shadcn-studio/table/table-01";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  COE_COPY_TYPE_LABELS,
  coeReference,
  isThirdPartyCoeRequest,
  type CoeRequest,
} from "@/lib/hrdo";
import { fmtDate } from "@/lib/format";
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
      <ul className="grid gap-2 sm:grid-cols-2 2xl:hidden">
        {requests.map((request) => (
          <li key={request.id} className="min-w-0 rounded-lg border bg-card p-4 shadow-xs">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Request ID</p>
                <p className="break-words font-mono text-[13px] font-semibold" title={request.id}>
                  {coeReference(request.id)}
                </p>
              </div>
              <CoeStatusBadge status={request.status} audience={audience} />
            </div>
            {staff && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                <p className="break-words text-muted-foreground">
                  <span className="font-medium text-foreground">{request.employeeName}</span>
                  {request.employeeNumber ? ` · ${request.employeeNumber}` : ""}
                </p>
                <RequestorTypeBadge thirdParty={isThirdPartyCoeRequest(request.note)} />
              </div>
            )}
            <dl className="mt-2 grid min-w-0 grid-cols-2 gap-x-2 gap-y-1.5 text-[13px]">
              {staff && (
                <div className="col-span-2 min-w-0">
                  <dt className="text-[11px] text-muted-foreground">Department / Office</dt>
                  <dd className="break-words">{request.department || "—"}</dd>
                </div>
              )}
              <div className="min-w-0">
                <dt className="text-[11px] text-muted-foreground">Date Requested</dt>
                <dd className="break-words">{fmtDate(request.requestedAt)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] text-muted-foreground">Type of Copy</dt>
                <dd className="break-words">{COE_COPY_TYPE_LABELS[request.copyType]}</dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-[11px] text-muted-foreground">Deadline</dt>
                <dd className="mt-0.5">
                  <CoeDeadlineBadge deadlineAt={request.deadlineAt} status={request.status} />
                </dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-[11px] text-muted-foreground">Purpose</dt>
                <dd className="break-words">{request.purpose}</dd>
              </div>
              {staff && (
                <div className="col-span-2 min-w-0">
                  <dt className="text-[11px] text-muted-foreground">Last handled by</dt>
                  <dd className="break-words">{request.processedByName || "No HRDO action yet"}</dd>
                </div>
              )}
            </dl>
            <Link
              to="/hrdo/coe/$id"
              params={{ id: request.id }}
              className="mt-2 inline-flex min-h-9 items-center gap-1 text-[13px] font-medium text-primary hover:underline"
            >
              {staff ? "View / Process" : "View details"}{" "}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden lg:block">
        <Table01 label={staff ? "COE staff requests" : "My COE requests"}>
          <TableHeader className="bg-muted/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[140px] text-xs font-semibold uppercase tracking-wide">
                Request ID
              </TableHead>
              {staff ? (
                <>
                  <TableHead className="w-[220px] text-xs font-semibold uppercase tracking-wide">
                    Requestor
                  </TableHead>
                  <TableHead className="w-[130px] text-xs font-semibold uppercase tracking-wide">
                    Employee ID
                  </TableHead>
                  <TableHead className="w-[180px] text-xs font-semibold uppercase tracking-wide">
                    Department
                  </TableHead>
                  <TableHead className="w-[120px] text-xs font-semibold uppercase tracking-wide">
                    Date
                  </TableHead>
                  <TableHead className="w-[140px] text-xs font-semibold uppercase tracking-wide">
                    Copy
                  </TableHead>
                </>
              ) : (
                <>
                  <TableHead className="w-[120px] text-xs font-semibold uppercase tracking-wide">
                    Date
                  </TableHead>
                  <TableHead className="min-w-[280px] text-xs font-semibold uppercase tracking-wide">
                    Purpose
                  </TableHead>
                </>
              )}
              <TableHead className="w-[165px] text-xs font-semibold uppercase tracking-wide">
                Deadline
              </TableHead>
              <TableHead className="w-[160px] text-xs font-semibold uppercase tracking-wide">
                Status
              </TableHead>
              <TableHead className="w-[135px] text-right text-xs font-semibold uppercase tracking-wide">
                Action
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id} className="align-top">
                <TableCell
                  className="font-mono text-xs font-medium text-foreground"
                  title={request.id}
                >
                  {coeReference(request.id)}
                </TableCell>
                {staff ? (
                  <>
                    <TableCell className="font-medium">
                      <span className="block break-words" title={request.employeeName}>
                        {request.employeeName}
                      </span>
                      <RequestorTypeBadge
                        thirdParty={isThirdPartyCoeRequest(request.note)}
                        className="mt-1"
                      />
                    </TableCell>
                    <TableCell>{request.employeeNumber || "—"}</TableCell>
                    <TableCell className="break-words" title={request.department || undefined}>
                      {request.department || "—"}
                    </TableCell>
                    <TableCell>{fmtDate(request.requestedAt)}</TableCell>
                    <TableCell className="break-words">
                      {COE_COPY_TYPE_LABELS[request.copyType]}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>{fmtDate(request.requestedAt)}</TableCell>
                    <TableCell
                      className="max-w-[360px] break-words font-medium"
                      title={request.purpose}
                    >
                      {request.purpose}
                    </TableCell>
                  </>
                )}
                <TableCell>
                  <CoeDeadlineBadge
                    deadlineAt={request.deadlineAt}
                    status={request.status}
                    className="whitespace-nowrap px-2 py-1 text-xs"
                  />
                </TableCell>
                <TableCell>
                  <CoeStatusBadge
                    status={request.status}
                    audience={audience}
                    className="px-2 py-1 text-xs"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    to="/hrdo/coe/$id"
                    params={{ id: request.id }}
                    className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap font-medium text-primary hover:underline"
                  >
                    {staff ? "View / Process" : "View details"}{" "}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table01>
      </div>
    </>
  );
}

function RequestorTypeBadge({
  thirdParty,
  className = "",
}: {
  thirdParty: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
        thirdParty
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-blue-300 bg-blue-50 text-blue-800"
      } ${className}`}
    >
      {thirdParty ? "External / former employee" : "Internal employee"}
    </span>
  );
}
