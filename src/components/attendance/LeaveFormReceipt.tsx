import { LEAVE_TYPES, LEAVE_STATUS, type LeaveRequest } from "@/lib/leaves";
import { fmtDate, fmtDateTime } from "@/lib/format";

export function LeaveFormReceipt({ request: r }: { request: LeaveRequest }) {
  return (
    <article id="leave-print" className="space-y-5 bg-white p-4 text-black sm:p-8">
      <style>{`@media print { body * { visibility:hidden } #leave-print, #leave-print * { visibility:visible } #leave-print { position:absolute;inset:0;padding:12mm;font-size:11px } #leave-print h2 { font-size:20px } @page { size:A4; margin:0 } }`}</style>
      <header className="grid grid-cols-[64px_1fr] border border-black sm:grid-cols-[90px_1fr_150px]">
        <div className="flex items-center justify-center border-r border-black p-2">
          <img src="/loa-logo.png" alt="Lyceum of Alabang seal" className="w-full object-contain" />
        </div>
        <div className="p-3 text-center">
          <h2 className="text-xl font-bold sm:text-2xl">LYCEUM OF ALABANG</h2>
          <p className="text-xs">ISO 9001:2015 CERTIFIED</p>
          <p className="mt-3 text-xs font-bold">HUMAN RESOURCE DEVELOPMENT OFFICE</p>
          <h3 className="mt-2 text-xl font-bold">LEAVE FORM</h3>
        </div>
        <dl className="col-span-2 grid grid-cols-2 border-t border-black text-xs sm:col-span-1 sm:block sm:border-l sm:border-t-0">
          {[
            ["Document No.", "LOA-HRDO-LF-034"],
            ["Revision No.", "01"],
            ["Effective Date", "August 20, 2025"],
            ["Page No.", "1 of 1"],
          ].map(([a, b]) => (
            <div key={a} className="border-b border-black p-2 last:border-b-0">
              <dt>{a}</dt>
              <dd className="font-semibold">{b}</dd>
            </div>
          ))}
        </dl>
      </header>
      <LeaveNotes />
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <p>
          <strong>Employee Name:</strong> {r.employee_name}
        </p>
        <p>
          <strong>Date of filing:</strong> {fmtDate(r.created_at)}
        </p>
        <p className="sm:col-span-2">
          <strong>Department:</strong> {r.department}
        </p>
      </div>
      <Band>REASON FOR LEAVE</Band>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {["V", "S", "B", "E"].map((code) => (
          <label key={code} className="flex items-center gap-2">
            <input type="checkbox" checked={r.code === code} readOnly tabIndex={-1} />
            {LEAVE_TYPES[code as keyof typeof LEAVE_TYPES]}
          </label>
        ))}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!["V", "S", "B", "E"].includes(r.code)}
            readOnly
            tabIndex={-1}
          />
          Others: {!["V", "S", "B", "E"].includes(r.code) ? LEAVE_TYPES[r.code] : "—"}
        </label>
      </div>
      <p className="whitespace-pre-wrap text-sm">
        <strong>REASON:</strong> {r.reason}
      </p>
      <Band>LEAVE REQUESTED</Band>
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <p>
          From: <strong>{fmtDate(r.dates[0]!)}</strong>
        </p>
        <p>
          To: <strong>{fmtDate(r.dates.at(-1)!)}</strong>
        </p>
        <p>
          Total days: <strong>{r.dates.length}</strong>
        </p>
      </div>
      <p className="text-xs">Requested dates: {r.dates.map((date) => fmtDate(date)).join(", ")}</p>
      <Signed image={r.employee_signature} name={r.employee_name} label="Employee’s Signature" />
      <Band>RECOMMENDING APPROVAL</Band>
      <div className="grid gap-5 sm:grid-cols-2">
        <Signed
          image={!r.president_required ? r.recommender_signature : null}
          name={!r.president_required ? r.recommender_name : "Not required for this application"}
          label="Department Head / Immediate Supervisor"
        />
        <Signed
          image={r.president_required ? r.recommender_signature : null}
          name={r.president_required ? r.recommender_name : "Not required for this application"}
          label="President / CEO"
        />
      </div>
      <Band>For HR USE ONLY</Band>
      <Signed
        image={r.hr_signature}
        name={r.hr_name ?? "Awaiting HR review"}
        label="Received by — Human Resources Development Office"
      />
      <div className="grid gap-3 border border-black p-3 text-sm sm:grid-cols-2">
        <div>
          <p>
            Utilized Leave/s: <strong>{r.balances?.usedSl ?? "—"}</strong> Sick Leave /{" "}
            <strong>{r.balances?.usedVl ?? "—"}</strong> Vacation Leave
          </p>
          <p>
            Remaining Leave/s: <strong>{r.balances?.remainingSl ?? "—"}</strong> Sick Leave /{" "}
            <strong>{r.balances?.remainingVl ?? "—"}</strong> Vacation Leave
          </p>
        </div>
        <p>
          {r.status === "rejected"
            ? "Credit classification: Not applicable"
            : r.credited === null
              ? "Credit classification: Awaiting HR"
              : r.credited
                ? "Credited"
                : "Not credited — no SL/VL deduction"}
        </p>
      </div>
      <p className="text-xs">
        <strong>{LEAVE_STATUS[r.status]}</strong>
        {r.decided_at ? ` · ${fmtDateTime(r.decided_at)}` : ""}
        {r.note ? ` · ${r.note}` : ""}
      </p>
      {r.status === "approved" && !r.balances && (
        <p className="text-xs">
          {r.credited === 0
            ? "Not credited — no SL/VL credits were deducted. HR records this leave in the tracker outside the paid-leave cells."
            : "Leave balances will appear after HR’s tracker update is confirmed."}
        </p>
      )}
      <footer className="border-t border-black pt-2 text-right text-[10px]">
        ISO 9001:2015 QMS Document
        <br />
        This is a controlled document and is subject to revision control requirement. Users should
        verify latest revision.
        <br />
        Application reference: {r.id}
      </footer>
    </article>
  );
}
function Band({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="border border-black bg-gray-100 px-3 py-1.5 text-sm font-bold">{children}</h4>
  );
}
function Signed({ image, name, label }: { image: string | null; name: string; label: string }) {
  return (
    <div className="text-center text-sm">
      {image ? (
        <img
          src={image}
          alt={`${label} signature`}
          className="mx-auto h-14 max-w-full object-contain"
        />
      ) : (
        <div className="h-14" />
      )}
      <p className="border-t border-black pt-1 font-medium">{name}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}
export function LeaveNotes() {
  return (
    <div className="border border-current p-3 text-xs leading-relaxed">
      <strong>NOTE:</strong>
      <ol className="ml-4 list-decimal space-y-1">
        <li>
          Employees who go on sick leave for two consecutive days and beyond should attach their
          medical certificate. Sick leaves made upon doctor’s advice should likewise be supported by
          a medical certificate.
        </li>
        <li>Applications for sick leave should be filed on the date of reporting back to work.</li>
        <li>
          For vacation and other leaves, state the reason and file five days before the start of the
          leave applied for.
        </li>
      </ol>
    </div>
  );
}
