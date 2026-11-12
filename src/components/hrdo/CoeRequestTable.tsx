import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { EmptyState } from "@/components/app/PageHeader";
import { CoeStatusBadge } from "./CoeStatusBadge";
import { CoeDeadlineBadge } from "./CoeDeadline";
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
      <div className="hidden 2xl:block">
        <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
          <table className="w-full min-w-[840px] table-fixed text-left text-xs 2xl:text-[13px]">
            {staff && (
              <colgroup>
                <col style={{ width: "7%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "6%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
            )}
            {!staff && (
              <colgroup>
                <col style={{ width: "14%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
            )}
            <thead className="border-b bg-muted/70 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-medium">Request ID</th>
                {staff ? (
                  <>
                    <th className="px-3 py-3 font-medium">Requestor</th>
                    <th className="px-3 py-3 font-medium">Employee ID</th>
                    <th className="px-3 py-3 font-medium">Dept.</th>
                    <th className="px-3 py-3 font-medium">Date</th>
                    <th className="px-3 py-3 font-medium">Copy</th>
                    <th className="px-3 py-3 font-medium">Last handled by</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-3 font-medium">Date</th>
                    <th className="px-3 py-3 font-medium">Purpose</th>
                  </>
                )}
                <th className="px-3 py-3 font-medium">Deadline</th>
                <th className="px-3 py-3 text-right font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr
                  key={request.id}
                  className="border-b bg-card align-top transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td
                    className="break-words px-3 py-3 font-mono text-[11px] font-medium"
                    title={request.id}
                  >
                    {coeReference(request.id)}
                  </td>
                  {staff ? (
                    <>
                      <td className="break-words px-3 py-3 font-medium">
                        <span className="block" title={request.employeeName}>
                          {request.employeeName}
                        </span>
                        <RequestorTypeBadge
                          thirdParty={isThirdPartyCoeRequest(request.note)}
                          className="mt-1"
                        />
                      </td>
                      <td className="break-words px-3 py-3">{request.employeeNumber || "—"}</td>
                      <td className="break-words px-3 py-3" title={request.department || undefined}>
                        {request.department || "—"}
                      </td>
                      <td className="break-words px-3 py-3">{fmtDate(request.requestedAt)}</td>
                      <td className="break-words px-3 py-3">
                        {COE_COPY_TYPE_LABELS[request.copyType]}
                      </td>
                      <td className="break-words px-3 py-3">
                        {request.processedByName || "No HRDO action yet"}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="break-words px-3 py-3">{fmtDate(request.requestedAt)}</td>
                      <td className="break-words px-3 py-3 font-medium" title={request.purpose}>
                        {request.purpose}
                      </td>
                    </>
                  )}
                  <td className="break-words px-3 py-3">
                    <CoeDeadlineBadge
                      deadlineAt={request.deadlineAt}
                      status={request.status}
                      className="px-1 py-0.5 text-xs 2xl:text-[13px] sm:whitespace-normal"
                    />
                  </td>
                  <td className="px-3 py-3 text-right font-medium">
                    <CoeStatusBadge
                      status={request.status}
                      audience={audience}
                      className="px-1 py-0.5 text-[13px] leading-tight 2xl:text-sm sm:whitespace-normal"
                    />
                  </td>
                  <td className="px-3 py-3 text-right font-medium">
                    <Link
                      to="/hrdo/coe/$id"
                      params={{ id: request.id }}
                      className="inline-flex items-center gap-1 whitespace-nowrap text-primary hover:underline"
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
