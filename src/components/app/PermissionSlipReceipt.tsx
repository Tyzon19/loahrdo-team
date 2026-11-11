import type { RefObject } from "react";
import type { PermissionSlip } from "@/server/permission";
import { fmtDateTime, fmtTime } from "@/lib/format";

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-PH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function PermissionSlipReceipt({
  slip,
  receiptRef,
}: {
  slip: PermissionSlip;
  receiptRef?: RefObject<HTMLDivElement | null>;
}) {
  const directorName = slip.departmentHeadName?.trim() || "HRDO Director";

  return (
    <div
      ref={receiptRef}
      className="mx-auto w-full max-w-3xl overflow-hidden border-2 border-slate-700 bg-white font-sans text-slate-900 shadow-lg"
      style={{ fontFamily: "'Arial', sans-serif" }}
    >
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-[52px_minmax(0,1fr)_112px] border-b-2 border-slate-700 sm:grid-cols-[90px_1fr_200px]">
        {/* Logo */}
        <div className="flex items-center justify-center border-r-2 border-slate-700 p-2">
          <img
            src="/lyceum-logo.png.png"
            alt="Lyceum of Alabang seal"
            className="h-12 w-12 object-contain sm:h-[72px] sm:w-[72px]"
          />
        </div>

        {/* Title block */}
        <div className="flex min-w-0 flex-col items-center justify-center px-1.5 py-2 text-center sm:px-4 sm:py-3">
          <p className="text-[8px] font-semibold uppercase tracking-widest text-slate-500 sm:text-[11px]">
            Lyceum of Alabang, Inc.
          </p>
          <h1 className="mt-0.5 text-sm font-extrabold uppercase tracking-widest text-slate-900 sm:text-[22px]">
            Permission Slip
          </h1>
          <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-slate-600 sm:text-[10px]">
            BS EN ISO 9001:2015
          </p>
          <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-800 sm:text-[11px]">
            Human Resource Development Office
          </p>
        </div>

        {/* Document metadata */}
        <div className="border-l-2 border-slate-700 text-[8px] text-slate-700 sm:text-[10.5px]">
          <div className="border-b border-slate-400 px-1.5 py-1 sm:px-3 sm:py-1.5">
            <span className="text-slate-500">Document No.:</span>
            <span className="ml-1 font-semibold">HRD-AF-002</span>
          </div>
          <div className="border-b border-slate-400 px-1.5 py-1 sm:px-3 sm:py-1.5">
            <span className="text-slate-500">Revision No.:</span>
            <span className="ml-1 font-semibold">1</span>
          </div>
          <div className="border-b border-slate-400 px-1.5 py-1 sm:px-3 sm:py-1.5">
            <span className="text-slate-500">Effective Date:</span>
            <span className="ml-1 font-semibold">June 2018</span>
          </div>
          <div className="px-1.5 py-1 sm:px-3 sm:py-1.5">
            <span className="text-slate-500">Page:</span>
            <span className="ml-1 font-semibold">1 of 2 · HR Copy</span>
          </div>
        </div>
      </div>

      {/* ── NAME row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-[86px_minmax(0,1fr)] border-b border-slate-400 text-xs sm:grid-cols-[140px_1fr] sm:text-sm">
        <div className="border-r border-slate-700 bg-slate-50/70 px-2 py-2 text-[9px] font-bold uppercase tracking-wide text-slate-700 sm:px-4 sm:py-2.5 sm:text-xs">
          Name:
        </div>
        <div className="min-w-0 break-words px-2 py-2 font-bold uppercase tracking-wide text-slate-950 sm:px-4 sm:py-2.5">
          {slip.employeeName}
        </div>
      </div>

      {/* ── DEPARTMENT + DATE row ──────────────────────────────────────── */}
      <div className="grid grid-cols-[86px_minmax(0,1fr)_44px_86px] border-b border-slate-400 text-xs sm:grid-cols-[140px_1fr_80px_140px] sm:text-sm">
        <div className="border-r border-slate-700 bg-slate-50/70 px-2 py-2 text-[9px] font-bold uppercase tracking-wide text-slate-700 sm:px-4 sm:py-2.5 sm:text-xs">
          Department:
        </div>
        <div className="min-w-0 break-words border-r border-slate-400 px-2 py-2 font-semibold text-slate-900 sm:px-4 sm:py-2.5">
          {slip.department}
        </div>
        <div className="border-r border-slate-400 bg-slate-50/70 px-1.5 py-2 text-[8px] font-bold uppercase tracking-wide text-slate-700 sm:px-3 sm:py-2.5 sm:text-xs">
          Date:
        </div>
        <div className="min-w-0 break-words px-1.5 py-2 text-xs font-bold text-slate-950 sm:px-3 sm:py-2.5 sm:text-sm">
          {formatDate(slip.requestedDate)}
        </div>
      </div>

      {/* ── TIME OUT + TIME IN row ─────────────────────────────────────── */}
      <div className="grid grid-cols-[86px_minmax(0,1fr)_64px_minmax(0,1fr)] border-b-2 border-slate-700 text-xs sm:grid-cols-[140px_1fr_120px_1fr] sm:text-sm">
        <div className="border-r border-slate-700 bg-slate-50/70 px-2 py-2 text-[9px] font-bold uppercase tracking-wide text-slate-700 sm:px-4 sm:py-2.5 sm:text-xs">
          Time Out:
        </div>
        <div className="min-w-0 border-r border-slate-400 px-2 py-2 font-extrabold text-blue-950 sm:px-4 sm:py-2.5">
          {fmtTime(slip.timeOut)}
        </div>
        <div className="border-r border-slate-400 bg-slate-50/70 px-1.5 py-2 text-[8px] font-bold uppercase tracking-wide text-slate-700 sm:px-3 sm:py-2.5 sm:text-xs">
          Time In:
        </div>
        <div className="min-w-0 px-1.5 py-2 font-extrabold text-blue-950 sm:px-3 sm:py-2.5">
          {fmtTime(slip.timeIn)}
        </div>
      </div>

      {/* ── REASON FOR GOING OUT ───────────────────────────────────────── */}
      <div className="border-b-2 border-slate-700">
        <div className="border-b border-slate-400 bg-slate-50/80 px-2 py-2 text-[9px] font-bold uppercase tracking-wide text-slate-800 sm:px-4 sm:text-xs">
          Reason for Going Out:
        </div>
        <div className="min-h-[56px] px-2 py-3 text-xs font-semibold leading-relaxed text-slate-950 whitespace-pre-wrap sm:min-h-[64px] sm:px-4 sm:text-sm">
          {slip.reason}
        </div>
      </div>

      {/* ── EMPLOYEE'S SIGNATURE ───────────────────────────────────────── */}
      <div className="border-b-2 border-slate-700">
        <div className="border-b border-slate-400 bg-slate-50/70 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-700">
          Employee&apos;s Signature:
        </div>
        <div className="flex flex-col items-center justify-center px-4 py-4">
          <div className="flex min-h-[108px] w-full max-w-lg items-center justify-center sm:min-h-[144px]">
            {slip.employeeSignature ? (
              <img
                src={slip.employeeSignature}
                alt={`Signature of ${slip.employeeName}`}
                className="max-h-28 max-w-[92%] object-contain sm:max-h-36"
              />
            ) : null}
          </div>
          <div className="w-full max-w-xs border-t-2 border-slate-700" />
          <p className="mt-2 text-center text-xs font-black uppercase tracking-wider text-slate-950">
            {slip.employeeName}
          </p>
          <p className="text-center text-[10.5px] font-bold text-slate-700">
            Signature over Printed Name
          </p>
          <p className="mt-1 text-center text-[10px] font-semibold text-slate-600">
            Signed on {fmtDateTime(slip.requestedAt)}
          </p>
        </div>
      </div>

      {/* ── APPROVED BY ────────────────────────────────────────────────── */}
      <div className="border-b border-slate-700">
        <div className="grid grid-cols-[112px_minmax(0,1fr)] sm:grid-cols-[240px_1fr]">
          {/* Left Column: Department Head on top, line, HRDO on bottom */}
          <div className="flex min-w-0 flex-col border-r-2 border-slate-700">
            {/* Top row: Approved by Department Head (arrow removed) */}
            <div className="flex-1 border-b border-slate-400 p-2 sm:p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Approved by:
              </p>
              <p className="mt-1 pl-4 text-xs font-extrabold uppercase tracking-wide text-slate-900">
                Department Head
              </p>
            </div>
            {/* Bottom row: HRDO */}
            <div className="flex items-center justify-center p-2 sm:p-3">
              <span className="text-xs font-extrabold uppercase tracking-widest text-slate-900">
                HRDO:
              </span>
            </div>
          </div>

          {/* Right Column: Signature Block */}
          <div className="flex min-w-0 flex-col items-center justify-center px-2 py-3 sm:px-4 sm:py-4">
            <div className="flex min-h-[108px] w-full max-w-lg items-center justify-center sm:min-h-[144px]">
              {slip.departmentHeadSignature ? (
                <img
                  src={slip.departmentHeadSignature}
                  alt={`Signature of ${directorName}`}
                  className="max-h-28 max-w-[92%] object-contain sm:max-h-36"
                />
              ) : (
                <span className="text-xs italic text-slate-400">— not yet signed —</span>
              )}
            </div>
            <div className="w-full max-w-xs border-t-2 border-slate-700" />
            <p className="mt-2 text-center text-xs font-black uppercase tracking-wider text-slate-950">
              {directorName}
            </p>
            <p className="text-center text-[10.5px] font-bold text-slate-700">
              Signature over Printed Name
            </p>
            <p className="mt-1 text-center text-[10px] font-semibold text-slate-600">
              {slip.approvedAt ? (
                <>Signed on {fmtDateTime(slip.approvedAt)}</>
              ) : (
                <span className="italic text-slate-400">Awaiting HRDO Approval</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-1 border-t border-slate-300 bg-slate-50 px-4 py-2 text-[9px] text-slate-400">
        <span>File Name: PERMISSION SLIP.docx</span>
        <span className="text-center italic">
          This is a controlled document and is subject to revision control requirement.
          User should verify latest revision.
        </span>
        <span>ISO 9001:2015 QMS Document</span>
      </div>
    </div>
  );
}
