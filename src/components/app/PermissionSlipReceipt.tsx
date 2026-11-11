import type { RefObject } from "react";
import type { PermissionSlip } from "@/server/permission";
import { fmtDateTime } from "@/lib/format";

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
      className="mx-auto w-full max-w-3xl border-2 border-slate-700 bg-white font-sans text-slate-900 shadow-lg"
      style={{ fontFamily: "'Arial', sans-serif" }}
    >
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-[90px_1fr_200px] border-b-2 border-slate-700">
        {/* Logo */}
        <div className="flex items-center justify-center border-r-2 border-slate-700 p-2">
          <img
            src="/lyceum-logo.png.png"
            alt="Lyceum of Alabang seal"
            className="h-[72px] w-[72px] object-contain"
          />
        </div>

        {/* Title block */}
        <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Lyceum of Alabang, Inc.
          </p>
          <h1 className="mt-0.5 text-[22px] font-extrabold uppercase tracking-widest text-slate-900">
            Permission Slip
          </h1>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            BS EN ISO 9001:2015
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-800">
            Human Resource Development Office
          </p>
        </div>

        {/* Document metadata */}
        <div className="border-l-2 border-slate-700 text-[10.5px] text-slate-700">
          <div className="border-b border-slate-400 px-3 py-1.5">
            <span className="text-slate-500">Document No.:</span>
            <span className="ml-1 font-semibold">HRD-AF-002</span>
          </div>
          <div className="border-b border-slate-400 px-3 py-1.5">
            <span className="text-slate-500">Revision No.:</span>
            <span className="ml-1 font-semibold">1</span>
          </div>
          <div className="border-b border-slate-400 px-3 py-1.5">
            <span className="text-slate-500">Effective Date:</span>
            <span className="ml-1 font-semibold">June 2018</span>
          </div>
          <div className="px-3 py-1.5">
            <span className="text-slate-500">Page:</span>
            <span className="ml-1 font-semibold">1 of 2 · HR Copy</span>
          </div>
        </div>
      </div>

      {/* ── NAME row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-[140px_1fr] border-b border-slate-400 text-sm">
        <div className="border-r border-slate-700 bg-slate-50/70 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-700">
          Name:
        </div>
        <div className="px-4 py-2.5 font-bold uppercase tracking-wide text-slate-950">
          {slip.employeeName}
        </div>
      </div>

      {/* ── DEPARTMENT + DATE row ──────────────────────────────────────── */}
      <div className="grid grid-cols-[140px_1fr_80px_140px] border-b border-slate-400 text-sm">
        <div className="border-r border-slate-700 bg-slate-50/70 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-700">
          Department:
        </div>
        <div className="border-r border-slate-400 px-4 py-2.5 font-semibold text-slate-900">
          {slip.department}
        </div>
        <div className="border-r border-slate-400 bg-slate-50/70 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-700">
          Date:
        </div>
        <div className="px-3 py-2.5 text-sm font-bold text-slate-950">
          {formatDate(slip.requestedDate)}
        </div>
      </div>

      {/* ── TIME OUT + TIME IN row ─────────────────────────────────────── */}
      <div className="grid grid-cols-[140px_1fr_120px_1fr] border-b-2 border-slate-700 text-sm">
        <div className="border-r border-slate-700 bg-slate-50/70 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-700">
          Time Out:
        </div>
        <div className="border-r border-slate-400 px-4 py-2.5 font-extrabold text-blue-950">
          {slip.timeOut}
        </div>
        <div className="border-r border-slate-400 bg-slate-50/70 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-700">
          Time In:
        </div>
        <div className="px-3 py-2.5 font-extrabold text-blue-950">
          {slip.timeIn}
        </div>
      </div>

      {/* ── REASON FOR GOING OUT ───────────────────────────────────────── */}
      <div className="border-b-2 border-slate-700">
        <div className="border-b border-slate-400 bg-slate-50/80 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-800">
          Reason for Going Out:
        </div>
        <div className="min-h-[64px] px-4 py-3 text-sm font-semibold leading-relaxed text-slate-950 whitespace-pre-wrap">
          {slip.reason}
        </div>
      </div>

      {/* ── EMPLOYEE'S SIGNATURE ───────────────────────────────────────── */}
      <div className="border-b-2 border-slate-700">
        <div className="border-b border-slate-400 bg-slate-50/70 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-700">
          Employee&apos;s Signature:
        </div>
        <div className="flex flex-col items-center justify-center px-4 py-4">
          <div className="flex min-h-[96px] w-full max-w-sm items-center justify-center">
            {slip.employeeSignature ? (
              <img
                src={slip.employeeSignature}
                alt={`Signature of ${slip.employeeName}`}
                className="max-h-24 max-w-full object-contain"
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
        <div className="grid grid-cols-[240px_1fr]">
          {/* Left Column: Department Head on top, line, HRDO on bottom */}
          <div className="flex flex-col border-r-2 border-slate-700">
            {/* Top row: Approved by Department Head (arrow removed) */}
            <div className="flex-1 border-b border-slate-400 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Approved by:
              </p>
              <p className="mt-1 pl-4 text-xs font-extrabold uppercase tracking-wide text-slate-900">
                Department Head
              </p>
            </div>
            {/* Bottom row: HRDO */}
            <div className="flex items-center justify-center p-3">
              <span className="text-xs font-extrabold uppercase tracking-widest text-slate-900">
                HRDO:
              </span>
            </div>
          </div>

          {/* Right Column: Signature Block */}
          <div className="flex flex-col items-center justify-center px-4 py-4">
            <div className="flex min-h-[96px] w-full max-w-sm items-center justify-center">
              {slip.departmentHeadSignature ? (
                <img
                  src={slip.departmentHeadSignature}
                  alt={`Signature of ${directorName}`}
                  className="max-h-24 max-w-full object-contain"
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
