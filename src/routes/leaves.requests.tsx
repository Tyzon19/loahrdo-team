import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad, type SignatureValue } from "@/components/app/SignaturePad";
import { PageHeader } from "@/components/app/PageHeader";
import { LeaveFormReceipt, LeaveNotes } from "@/components/attendance/LeaveFormReceipt";
import { LEAVE_TYPES, LEAVE_STATUS, type LeaveRequest } from "@/lib/leaves";
import { attendanceAdminAllowed } from "@/lib/attendance-access";
import { fmtDate } from "@/lib/format";
import { unwrap } from "@/lib/api";
import {
  listLeavesFn,
  getLeaveFn,
  createLeaveFn,
  decideLeaveFn,
  retryLeaveDeliveryFn,
  leaveReportingLinesFn,
  saveLeaveReportingLineFn,
} from "@/server-functions";

export const Route = createFileRoute("/leaves/requests")({ component: LeaveApplications });
function ReportingLines({ busy, save }: { busy: boolean; save: (data: unknown) => Promise<void> }) {
  const result = useQuery({
    queryKey: ["leave-applications", "reporting-lines"],
    queryFn: () => unwrap(leaveReportingLinesFn()),
  });
  const [employeeId, setEmployee] = useState(""),
    [supervisorId, setSupervisor] = useState(""),
    [isHead, setHead] = useState(false),
    [missingOnly, setMissingOnly] = useState(false);
  const users = result.data?.users ?? [];
  const assigned = new Map((result.data?.lines ?? []).map((line) => [line.employeeId, line]));
  const userById = new Map(users.map((user) => [user.id, user]));
  const required = users.filter((user) => !user.routesToPresident);
  const coveredCount = required.filter((user) => assigned.has(user.id)).length;
  const missingCount = required.length - coveredCount;
  const visibleUsers = missingOnly ? required.filter((user) => !assigned.has(user.id)) : users;
  function edit(employee: (typeof users)[number]) {
    const line = assigned.get(employee.id);
    setEmployee(employee.id);
    setSupervisor(line?.supervisorId ?? "");
    setHead(line?.isHead ?? false);
  }
  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer font-semibold">
        HR settings: employee reporting lines
      </summary>
      <p className="my-3 text-sm text-muted-foreground">
        Assign each employee’s actual immediate supervisor. Department heads always go to the
        President / CEO. Changes apply to new applications; submitted applications retain their
        assigned reviewer.
      </p>
      {result.isPending ? (
        <p>Loading accounts…</p>
      ) : result.isError ? (
        <p role="alert">
          Unable to load reporting lines.{" "}
          <Button variant="link" onClick={() => void result.refetch()}>
            Try again
          </Button>
        </p>
      ) : (
        <div className="space-y-5">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save({ employeeId, supervisorId, isHead });
            }}
          >
            <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
              <legend className="sr-only">Reporting line assignment</legend>
              <div className="space-y-2">
                <Label htmlFor="leave-employee">Employee</Label>
                <select
                  id="leave-employee"
                  required
                  className="h-11 w-full rounded-md border bg-background px-3 text-sm"
                  value={employeeId}
                  onChange={(e) => {
                    const employee = userById.get(e.target.value);
                    if (employee) edit(employee);
                    else {
                      setEmployee("");
                      setSupervisor("");
                      setHead(false);
                    }
                  }}
                >
                  <option value="">Select an employee</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.department}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-supervisor">Immediate supervisor</Label>
                <select
                  id="leave-supervisor"
                  required
                  className="h-11 w-full rounded-md border bg-background px-3 text-sm"
                  value={supervisorId}
                  onChange={(e) => setSupervisor(e.target.value)}
                >
                  <option value="">Select their supervisor</option>
                  {users
                    .filter((u) => u.id !== employeeId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {u.department}
                      </option>
                    ))}
                </select>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isHead}
                  onChange={(e) => setHead(e.target.checked)}
                />
                This employee is a department head
              </label>
              <Button type="submit" disabled={!employeeId || !supervisorId}>
                {busy ? "Saving…" : "Save reporting line"}
              </Button>
            </fieldset>
          </form>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {coveredCount} of {required.length} employees who need a supervisor are assigned.
                {missingCount ? ` ${missingCount} still need one.` : " All are covered."}
              </p>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={missingOnly}
                  onChange={(e) => setMissingOnly(e.target.checked)}
                />
                Show only employees without a supervisor
              </label>
            </div>
            <div className="max-h-96 overflow-auto rounded-md border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted/80">
                  <tr>
                    <th className="px-3 py-2 font-medium">Employee</th>
                    <th className="px-3 py-2 font-medium">Department</th>
                    <th className="px-3 py-2 font-medium">Immediate supervisor</th>
                    <th className="px-3 py-2 font-medium">Head</th>
                    <th className="px-3 py-2">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleUsers.map((u) => {
                    const line = assigned.get(u.id);
                    const supervisor = line ? userById.get(line.supervisorId) : undefined;
                    return (
                      <tr key={u.id}>
                        <td className="px-3 py-2">{u.name}</td>
                        <td className="px-3 py-2">{u.department || "—"}</td>
                        <td className="px-3 py-2">
                          {line ? (
                            (supervisor?.name ?? "Missing account")
                          ) : u.routesToPresident ? (
                            "President / CEO (by role)"
                          ) : (
                            <span className="text-destructive">Not assigned</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {line?.isHead || u.routesToPresident ? "Yes" : "No"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button type="button" variant="link" size="sm" onClick={() => edit(u)}>
                            {line ? "Edit" : "Assign"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {visibleUsers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Every employee who needs a supervisor is assigned.
              </p>
            )}
          </div>
        </div>
      )}
    </details>
  );
}
function LeaveApplications() {
  const cache = useQueryClient();
  const result = useQuery({
    queryKey: ["leave-applications"],
    queryFn: () => unwrap(listLeavesFn()),
    refetchInterval: 15000,
  });
  const [creating, setCreating] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const detail = useQuery({
    queryKey: ["leave-applications", "detail", selected],
    queryFn: () => unwrap(getLeaveFn({ data: selected })),
    enabled: Boolean(selected),
    refetchInterval: 15000,
  });
  async function refresh() {
    await cache.invalidateQueries({ queryKey: ["leave-applications"] });
  }
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  if (result.isPending) return <p role="status">Loading leave applications…</p>;
  if (result.isError)
    return (
      <div role="alert">
        <p>Unable to load leave applications.</p>
        <Button onClick={() => void result.refetch()}>Try again</Button>
      </div>
    );
  const { user, requests, profile, pendingEmails, requiresPresident, reviewerName } = result.data;
  const admin = attendanceAdminAllowed(user);
  const request = selected ? detail.data : undefined;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Leave Applications"
        description="File your leave, follow its approval, and keep a signed copy."
        actions={
          !creating && (
            <Button
              disabled={!profile || !reviewerName}
              onClick={() => {
                setCreating(true);
                setSelected(null);
              }}
            >
              <Plus className="mr-2 size-4" />
              Request leave
            </Button>
          )
        }
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {profile && !reviewerName && (
        <p role="alert" className="rounded-lg border p-4 text-sm">
          HR must assign your immediate supervisor or configure the President / CEO account before
          you can request leave.
        </p>
      )}
      {selected && detail.isPending && <p role="status">Loading signed application…</p>}
      {selected && detail.isError && (
        <p role="alert">
          Unable to load this application.{" "}
          <Button variant="link" onClick={() => void detail.refetch()}>
            Try again
          </Button>
        </p>
      )}
      {admin && !selected && !creating && (
        <ReportingLines
          busy={busy}
          save={(data) => act(() => unwrap(saveLeaveReportingLineFn({ data })))}
        />
      )}
      {pendingEmails > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
          <p>{pendingEmails} email notification(s) awaiting delivery.</p>
          {admin && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void act(() => unwrap(retryLeaveDeliveryFn()))}
            >
              Retry email delivery
            </Button>
          )}
        </div>
      )}
      {creating ? (
        <NewLeave
          name={profile!.name}
          department={user.department}
          president={requiresPresident}
          reviewer={reviewerName}
          busy={busy}
          cancel={() => setCreating(false)}
          submit={(data) =>
            act(async () => {
              await unwrap(createLeaveFn({ data }));
              setCreating(false);
            })
          }
        />
      ) : request ? (
        <>
          <div className="flex flex-wrap justify-between gap-3">
            <Button variant="outline" onClick={() => setSelected(null)}>
              <ArrowLeft className="mr-2 size-4" />
              All applications
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 size-4" />
              Print / save PDF
            </Button>
          </div>
          <div className="rounded-lg border p-4 text-sm">
            <p className="font-semibold">{LEAVE_STATUS[request.status]}</p>
            <p className="mt-1">
              {request.president_required
                ? "President / CEO"
                : "Department Head / Immediate Supervisor"}
              : {request.recommender_name} → HR review
            </p>
            <p className="mt-1">
              Credit:{" "}
              {request.status === "rejected"
                ? "Not applicable"
                : request.credited === null
                  ? "Awaiting HR"
                  : request.credited
                    ? "Credited"
                    : "Not credited — no SL/VL deduction"}
            </p>
            {request.status === "approved" && (
              <p className="mt-2">
                Tracker:{" "}
                {request.credited === 0
                  ? "Not required — no paid-leave code was written"
                  : trackerStatus(request.sync_status)}
                {request.credited !== 0 && request.sync_error ? ` — ${request.sync_error}` : ""}
              </p>
            )}
          </div>
          {request.medical_certificate && (
            <a
              className="inline-block text-sm font-medium underline underline-offset-4"
              download={`medical-certificate-${request.id}.${request.medical_certificate.startsWith("data:application/pdf") ? "pdf" : request.medical_certificate.startsWith("data:image/png") ? "png" : "jpg"}`}
              href={request.medical_certificate}
            >
              Download medical certificate
            </a>
          )}
          {request.employee_id !== user.id &&
            ((request.status === "pending_recommendation" && request.recommender_id === user.id) ||
              (request.status === "pending_hr" && admin)) && (
              <Decision
                key={request.id}
                request={request}
                busy={busy}
                submit={(data) => act(() => unwrap(decideLeaveFn({ data })))}
              />
            )}
          <div className="overflow-hidden rounded-lg border">
            <LeaveFormReceipt request={request} />
          </div>
        </>
      ) : (
        <>
          {!profile && (
            <p className="rounded-lg border p-4 text-sm">
              Your active tracker record must be linked by HR before you can submit your own leave.
              Assigned approval requests are shown below.
            </p>
          )}
          <section className="overflow-hidden rounded-lg border" aria-label="Leave applications">
            <div className="border-b bg-muted/40 px-4 py-3">
              <h2 className="font-semibold">
                {admin ? "Applications for HR review" : "My applications & assigned approvals"}
              </h2>
            </div>
            {requests.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No leave applications yet. Your submitted and assigned requests will appear here.
              </p>
            ) : (
              <ul className="divide-y">
                {requests.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-3 px-4 py-4 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:flex-row sm:items-center"
                      onClick={() => setSelected(r.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{r.employee_name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {LEAVE_TYPES[r.code]} · {fmtDate(r.dates[0]!)} –{" "}
                          {fmtDate(r.dates.at(-1)!)} · {r.dates.length} day(s)
                        </p>
                      </div>
                      <span className="text-sm font-medium">
                        {LEAVE_STATUS[r.status]}
                        {r.credited === 0 ? " · Not credited" : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
function NewLeave({
  name,
  department,
  president,
  reviewer,
  busy,
  cancel,
  submit,
}: {
  name: string;
  department: string;
  president: boolean;
  reviewer: string | null;
  busy: boolean;
  cancel: () => void;
  submit: (data: unknown) => Promise<void>;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [code, setCode] = useState<keyof typeof LEAVE_TYPES>("V"),
    [reason, setReason] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [excluded, setExcluded] = useState<string[]>([]),
    [signature, setSignature] = useState<SignatureValue | null>(null),
    [medical, setMedical] = useState<string | undefined>(),
    [fileError, setFileError] = useState("");
  const dates: string[] = [];
  if (start && end && start <= end) {
    const date = new Date(`${start}T00:00:00Z`);
    while (date.toISOString().slice(0, 10) <= end && dates.length < 366) {
      dates.push(date.toISOString().slice(0, 10));
      date.setUTCDate(date.getUTCDate() + 1);
    }
  }
  const selected = dates.filter((date) => !excluded.includes(date));
  return (
    <form
      className="space-y-6 rounded-lg border bg-card p-4 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit({
          id,
          code,
          reason,
          dates: selected,
          signature,
          ...(medical ? { medicalCertificate: medical } : {}),
        });
      }}
    >
      <div>
        <h2 className="text-xl font-semibold">Request leave</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {name} · {department}
        </p>
        <p className="mt-2 text-sm">
          Your application goes to{" "}
          <strong>
            {reviewer ?? (president ? "the President / CEO" : "your immediate supervisor")}
          </strong>
          {president && reviewer ? " (President / CEO)" : ""}, then HR.
        </p>
      </div>
      <LeaveNotes />
      <fieldset disabled={busy} className="space-y-5">
        <legend className="sr-only">Leave application details</legend>
        <div className="space-y-2">
          <Label htmlFor="leave-type">Reason for leave</Label>
          <select
            id="leave-type"
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
            value={code}
            onChange={(e) => setCode(e.target.value as keyof typeof LEAVE_TYPES)}
          >
            {Object.entries(LEAVE_TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="leave-reason">Reason</Label>
          <Textarea
            id="leave-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            maxLength={2000}
            placeholder="Explain why you are requesting leave."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="leave-from">Leave requested from</Label>
            <Input
              id="leave-from"
              type="date"
              required
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setExcluded([]);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="leave-to">To</Label>
            <Input
              id="leave-to"
              type="date"
              required
              min={start}
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setExcluded([]);
              }}
            />
          </div>
        </div>
        {dates.length > 0 && (
          <fieldset className="rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">
              Total number of days requested: {selected.length}
            </legend>
            <p className="mb-3 text-xs text-muted-foreground">
              Select the actual leave dates. Uncheck rest days or holidays you are not requesting.
            </p>
            <div className="grid max-h-52 gap-1 overflow-y-auto sm:grid-cols-3">
              {dates.map((date) => (
                <label key={date} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!excluded.includes(date)}
                    onChange={(e) =>
                      setExcluded(
                        e.target.checked ? excluded.filter((d) => d !== date) : [...excluded, date],
                      )
                    }
                  />
                  {fmtDate(date)}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="space-y-2">
          <Label htmlFor="leave-medical">
            Medical certificate{" "}
            {code === "S" && selected.length >= 2 ? "(required)" : "(if applicable)"}
          </Label>
          <Input
            id="leave-medical"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => {
              setMedical(undefined);
              setFileError("");
              const file = e.target.files?.[0];
              if (!file) return;
              if (
                file.size > 2_900_000 ||
                !["application/pdf", "image/png", "image/jpeg"].includes(file.type)
              ) {
                setFileError("Choose a PDF, PNG or JPEG below 2.9 MB.");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => setMedical(String(reader.result));
              reader.onerror = () => setFileError("Unable to read this file. Try again.");
              reader.readAsDataURL(file);
            }}
          />
          {fileError && (
            <p role="alert" className="text-sm text-destructive">
              {fileError}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Employee’s signature</p>
          <SignaturePad onChange={setSignature} />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            disabled={
              !signature ||
              !selected.length ||
              Boolean(fileError) ||
              (code === "S" && selected.length >= 2 && !medical)
            }
          >
            {busy ? "Submitting…" : "Sign & submit application"}
          </Button>
          <Button type="button" variant="outline" onClick={cancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
function trackerStatus(status: LeaveRequest["sync_status"]) {
  return {
    pending: "Awaiting tracker update",
    synced: "Synced",
    error: "Needs HR attention",
    not_required: "Not required",
  }[status];
}
function Decision({
  request,
  busy,
  submit,
}: {
  request: LeaveRequest;
  busy: boolean;
  submit: (data: unknown) => Promise<void>;
}) {
  const [signature, setSignature] = useState<SignatureValue | null>(null),
    [note, setNote] = useState(""),
    [credited, setCredited] = useState<boolean | null>(null);
  const hr = request.status === "pending_hr";
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">
        {hr ? "HR review & receipt" : "Recommending approval"}
      </h2>
      <p className="text-sm text-muted-foreground">
        Review the signed application below before recording your decision.
      </p>
      <fieldset disabled={busy} className="space-y-4">
        <legend className="sr-only">Review decision</legend>
        {hr && (
          <div className="space-y-2">
            <div role="radiogroup" aria-label="Credit classification" className="flex gap-5">
              {[true, false].map((value) => (
                <label key={String(value)} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    name="credited"
                    type="radio"
                    checked={credited === value}
                    onChange={() => setCredited(value)}
                  />
                  {value ? "Credited" : "Not credited"}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {credited === null ? "Choose credited or not credited before approving. " : ""}
              Not credited approves the leave without deducting SL/VL. No paid-leave code is written
              to the tracker; HR records it using the institution’s non-crediting process.
            </p>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="leave-review-note">Remarks / reason for rejection</Label>
          <Textarea
            id="leave-review-note"
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <p className="text-sm font-medium">Your signature</p>
        <SignaturePad onChange={setSignature} />
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={!signature || (hr && credited === null)}
            onClick={() =>
              void submit({
                id: request.id,
                decision: "approve",
                signature,
                note,
                ...(hr && credited !== null ? { credited } : {}),
              })
            }
          >
            {busy ? "Saving…" : hr ? "Receive & approve leave" : "Sign & forward to HR"}
          </Button>
          <Button
            variant="destructive"
            disabled={!signature || note.trim().length < 3}
            onClick={() => void submit({ id: request.id, decision: "reject", signature, note })}
          >
            Reject application
          </Button>
        </div>
      </fieldset>
    </section>
  );
}
