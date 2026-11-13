import type { ReactNode, RefObject } from "react";
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

function DetailLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:text-[10px]">
      {children}
    </p>
  );
}

function SignatureBlock({
  label,
  image,
  imageAlt,
  name,
  caption,
  emptyNote,
}: {
  label: string;
  image: string | null;
  imageAlt: string;
  name: string;
  caption: string;
  emptyNote: string;
}) {
  return (
    <div className="flex flex-col">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:text-[10px]">
        {label}
      </p>
      <div className="mt-2 flex h-24 items-center justify-center sm:h-28">
        {image ? (
          <img src={image} alt={imageAlt} className="h-full w-full max-w-[92%] object-contain" />
        ) : (
          <span className="text-[11px] italic text-slate-400">{emptyNote}</span>
        )}
      </div>
      <div className="mt-1 border-t border-slate-400" />
      <p className="mt-2 break-words text-center text-xs font-bold uppercase tracking-wide text-slate-900 sm:text-[13px]">
        {name}
      </p>
      <p className="text-center text-[9px] font-medium uppercase tracking-[0.08em] text-slate-500 sm:text-[10px]">
        Signature over Printed Name
      </p>
      <p className="mt-1 text-center text-[9px] text-slate-500 sm:text-[10px]">{caption}</p>
    </div>
  );
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
      className="mx-auto w-full max-w-3xl select-none overflow-hidden border border-slate-300 bg-white text-slate-900 shadow-lg"
      onContextMenu={(event) => event.preventDefault()}
      style={{ fontFamily: "'Arial', Helvetica, sans-serif" }}
    >
      <div className="h-1.5 w-full bg-slate-800" />

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="px-4 pb-5 pt-5 sm:px-8 sm:pb-6 sm:pt-7">
        <div className="flex items-center justify-between gap-3">
          <img
            src="/loa-logo.png"
            alt="Lyceum of Alabang seal"
            className="h-14 w-14 shrink-0 object-contain sm:h-[76px] sm:w-[76px]"
          />

          <div className="min-w-0 flex-1 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-[10px]">
              Lyceum of Alabang, Inc.
            </p>
            <h1 className="mt-1 text-[19px] font-black uppercase leading-tight tracking-[0.12em] text-slate-900 sm:text-[27px]">
              Permission Slip
            </h1>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600 sm:text-[10.5px]">
              Human Resource Development Office
            </p>
            <p className="mt-1 text-[8px] font-medium uppercase tracking-[0.14em] text-slate-400 sm:text-[9px]">
              BS EN ISO 9001:2015
            </p>
          </div>

          <img
            src="/HRDO%20LOGO.png"
            alt="Human Resources Development Office"
            className="h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16"
          />
        </div>

        {/* Document metadata strip */}
        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 text-[9px] sm:mt-5 sm:grid-cols-4 sm:text-[10px]">
          {[
            ["Document No:", "HRD-AF-002"],
            ["Revision No:", "1"],
            ["Effective Date:", "June 2018"],
            ["Page:", "1 of 1 · HR Copy"],
          ].map(([label, value]) => (
            <div key={label} className="bg-slate-50 px-2.5 py-1.5 sm:px-3 sm:py-2">
              <dt className="font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="mt-0.5 font-bold text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {/* ── EMPLOYEE DETAILS ───────────────────────────────────────────── */}
      <section className="px-4 pb-4 sm:px-8 sm:pb-5">
        <div className="overflow-hidden rounded-md border border-slate-200">
          <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
            <div className="bg-white px-3 py-2.5 sm:col-span-2 sm:px-4 sm:py-3">
              <DetailLabel>Name of Employee</DetailLabel>
              <p className="mt-1 break-words text-sm font-bold uppercase tracking-wide text-slate-900 sm:text-[15px]">
                {slip.employeeName}
              </p>
            </div>
            <div className="bg-white px-3 py-2.5 sm:px-4 sm:py-3">
              <DetailLabel>Department / Office</DetailLabel>
              <p className="mt-1 break-words text-[13px] font-semibold text-slate-900 sm:text-sm">
                {slip.department}
              </p>
            </div>
            <div className="bg-white px-3 py-2.5 sm:px-4 sm:py-3">
              <DetailLabel>Date of Absence</DetailLabel>
              <p className="mt-1 text-[13px] font-bold text-slate-900 sm:text-sm">
                {formatDate(slip.requestedDate)}
              </p>
            </div>
            <div className="bg-white px-3 py-2.5 sm:px-4 sm:py-3">
              <DetailLabel>Time Out</DetailLabel>
              <p className="mt-1 text-[13px] font-bold text-slate-900 sm:text-sm">
                {fmtTime(slip.timeOut)}
              </p>
            </div>
            <div className="bg-white px-3 py-2.5 sm:px-4 sm:py-3">
              <DetailLabel>Time In</DetailLabel>
              <p className="mt-1 text-[13px] font-bold text-slate-900 sm:text-sm">
                {fmtTime(slip.timeIn)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-4 sm:px-8 sm:pb-5">
        <div className="overflow-hidden rounded-md border border-slate-200">
          <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-primary sm:px-4 sm:text-[10.5px]">
            Reason for Going Out
          </p>
          <div className="min-h-[64px] whitespace-pre-wrap bg-slate-50/60 px-3 py-3 font-serif text-[15px] font-medium leading-7 text-slate-950 sm:min-h-[78px] sm:px-4 sm:py-4 sm:text-base">
            {slip.reason}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 px-4 py-5 sm:px-8 sm:py-6">
        <div className="grid gap-7 sm:grid-cols-2 sm:gap-10">
          <SignatureBlock
            label="Employee's Signature"
            image={slip.employeeSignature}
            imageAlt={`Signature of ${slip.employeeName}`}
            name={slip.employeeName}
            caption={`Signed on ${fmtDateTime(slip.requestedAt)}`}
            emptyNote="No signature on file"
          />
          <SignatureBlock
            label="Approved by: Department Head"
            image={slip.departmentHeadSignature ?? null}
            imageAlt={`Signature of ${directorName}`}
            name={directorName}
            caption={
              slip.approvedAt
                ? `Signed on ${fmtDateTime(slip.approvedAt)}`
                : "Awaiting HRDO approval"
            }
            emptyNote="Not yet signed"
          />
        </div>
      </section>

      <footer className="flex flex-col gap-1 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-[9px] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-8">
        <span className="font-semibold uppercase tracking-wide">HRD-AF-002 · Permission Slip</span>
        <span className="sm:text-center">
          This is a controlled document and subject to revision control requirement. User should
          verify latest version.
        </span>
        <span className="uppercase tracking-wide">ISO 9001:2015</span>
      </footer>
    </div>
  );
}
