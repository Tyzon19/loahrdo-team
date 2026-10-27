import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  AlertTriangle,
  CheckCircle2,
  CornerUpLeft,
  Info,
  Mail,
  ArrowDownToLine,
  RefreshCw,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, Section, Field, EmptyState } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { StageStepper, HistoryList } from "@/components/app/Timeline";
import { ApproveDialog, RejectDialog } from "@/components/app/DecisionDialogs";
import { SignatureMark, type SignatureValue } from "@/components/app/SignaturePad";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { approveRequestFn, getRequestFn, rejectRequestFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
import { currentSignatures, STAGES, stageForStatus, vehicleWarnings } from "@/lib/workflow";
import type { RequestDetail, StageKey, Viewer } from "@/lib/types";
import { fmtDate, fmtDateTime, fmtRange, fmtTime } from "@/lib/format";
import { SITE } from "@/lib/site";
import { canViewAllRequests } from "@/lib/access";

type Search = { notice?: "submitted" | "resubmitted" | "edited" | undefined };

export const Route = createFileRoute("/_authenticated/requests/$id")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    notice:
      search["notice"] === "submitted" ||
      search["notice"] === "resubmitted" ||
      search["notice"] === "edited"
        ? search["notice"]
        : undefined,
  }),
  head: ({ params }) => ({
    meta: [
      { title: `Request ${params.id.slice(0, 8)} — ${SITE.name}` },
      { name: "description", content: "Review the vehicle request, approval stages and history." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RequestDetailPage,
});

const ACTION_LABEL: Record<StageKey, string> = {
  review: "Review, Sign & Forward",
  recommend: "Recommend Approval, Sign & Forward",
  approve: "Approve & Sign",
};

function Notice({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: "success" | "danger" | "info";
  icon: typeof Info;
  title: string;
  children?: React.ReactNode;
}) {
  const cls = {
    success: "border-success/40 bg-success-soft",
    danger: "border-destructive/40 bg-danger-soft",
    info: "border-primary/30 bg-info-soft",
  }[tone];
  const ic = { success: "text-success", danger: "text-destructive", info: "text-primary" }[tone];
  return (
    <div role="status" className={`flex min-w-0 gap-3 rounded-sm border p-3 ${cls}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${ic}`} aria-hidden />
      <div className="min-w-0 space-y-0.5 break-words [overflow-wrap:anywhere] text-sm">
        <p className="break-words font-semibold">{title}</p>
        {children}
      </div>
    </div>
  );
}

function RequestDetailPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const { viewer } = Route.useRouteContext();
  const query = useQuery({
    queryKey: ["request", id],
    queryFn: () => unwrap(getRequestFn({ data: id })),
    refetchOnWindowFocus: true,
  });

  if (!viewer) return null;

  if (query.isPending) {
    return (
      <>
        <PageHeader title="Request details" description="Loading the latest record…" />
        <LoadingPanel label="Loading request" rows={8} />
      </>
    );
  }

  if (query.isError) {
    return (
      <Section title="Request details">
        <div className="p-6 text-center" role="alert">
          <p className="font-medium">We couldn&apos;t load this request.</p>
          <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
          <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </Button>
        </div>
      </Section>
    );
  }

  const detail = query.data;
  if (!detail) {
    return (
      <Section title="Request not found">
        <EmptyState title="We couldn't find this request.">
          It may have been removed, or you may not have access to it.{" "}
          <Link to="/requests" className="text-primary underline">
            View your requests
          </Link>
        </EmptyState>
      </Section>
    );
  }

  const r = detail.request;
  const stage = stageForStatus(r.status);
  const isProxySigner = Boolean(stage && detail.assistantUserIds[stage.key] === viewer.id);
  const assignedMainUserId = stage ? detail.approverUserIds[stage.key] : undefined;
  const isAssignedMainSignatory = Boolean(stage && assignedMainUserId === viewer.id);
  const isRoleBasedSignatory = Boolean(stage && !assignedMainUserId && stage.role === viewer.role);
  const myTurn = Boolean(
    stage && (isAssignedMainSignatory || isRoleBasedSignatory || isProxySigner),
  );
  const isOwner = r.requisitionerId === viewer.id;
  const canSendTripTicket = canViewAllRequests(viewer.role);
  const sigs = currentSignatures(r);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Request ${r.number}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            <span>Submitted {fmtDateTime(r.submittedAt)}</span>
            {r.attempt > 1 && <span>· Attempt {r.attempt}</span>}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {isOwner && r.status === "pending_review" && (
              <Button asChild variant="outline">
                <Link to="/revise/$id" params={{ id: r.id }}>
                  Edit Request
                </Link>
              </Button>
            )}
            {["approved", "dispatched", "completed"].includes(r.status) && (
              <Button
                asChild
                variant={canSendTripTicket && !detail.tripTicketAttached ? "default" : "outline"}
              >
                <Link to="/print/$id" params={{ id: r.id }}>
                  {canSendTripTicket ? (
                    <Send className="h-4 w-4" aria-hidden />
                  ) : (
                    <ArrowDownToLine className="h-4 w-4" aria-hidden />
                  )}
                  {canSendTripTicket
                    ? detail.tripTicketAttached
                      ? "Trip Ticket Sent"
                      : "Send Trip Ticket"
                    : "Download Trip Ticket"}
                </Link>
              </Button>
            )}
          </div>
        }
      />

      {["approved", "dispatched", "completed"].includes(r.status) && canSendTripTicket && (
        <Notice
          tone={detail.tripTicketAttached ? "success" : "info"}
          icon={detail.tripTicketAttached ? CheckCircle2 : Info}
          title={
            detail.tripTicketAttached
              ? "Trip Ticket successfully sent to the requisitioner's email."
              : "Trip ticket is ready to send."
          }
        >
          {detail.tripTicketAttached
            ? "The requisitioner can view and download the ticket."
            : "Use Send Trip Ticket above to attach the ticket to the requisitioner's notification."}
        </Notice>
      )}

      {search.notice === "edited" && isOwner && r.status === "pending_review" && (
        <Notice tone="success" icon={CheckCircle2} title="Your request changes have been saved.">
          You can continue editing until the Head of Transport Services signs the request.
        </Notice>
      )}

      {search.notice === "submitted" && isOwner && r.status === "pending_review" && (
        <Notice
          tone="success"
          icon={CheckCircle2}
          title={`Your vehicle request ${r.number} has been submitted successfully.`}
        >
          It is now waiting for review by the Head of Transport Services. Updates appear in your
          notifications.
        </Notice>
      )}
      {search.notice === "resubmitted" && isOwner && r.status === "pending_review" && (
        <Notice
          tone="success"
          icon={CheckCircle2}
          title="Your revised request has been resubmitted."
        >
          Approval restarts with the Head of Transport Services. All three stages must sign again.
        </Notice>
      )}

      {r.status === "returned" && r.lastReturn && (
        <Notice
          tone="danger"
          icon={CornerUpLeft}
          title={`${isOwner ? "Your request has" : "This request has"} been returned by the ${
            STAGES.find((x) => x.key === r.lastReturn!.stage)!.title
          }.`}
        >
          <p>
            <strong>Reason:</strong> {r.lastReturn.reason}
          </p>
          <p className="text-xs">
            Returned by {r.lastReturn.byName} on {fmtDateTime(r.lastReturn.at)}
          </p>
          {isOwner && (
            <>
              <p className="mt-1">
                <strong>Next step:</strong> Review the comments, update your request, and resubmit
                it.
              </p>
              <Button asChild className="mt-2">
                <Link to="/revise/$id" params={{ id: r.id }}>
                  Revise &amp; Resubmit
                </Link>
              </Button>
            </>
          )}
        </Notice>
      )}

      {!myTurn && stage && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-primary/30 bg-info-soft px-3 py-2 text-sm">
          <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="flex-1">
            Waiting for the {stage.title} ({stage.label}).
            {detail.approverNames[stage.key]
              ? ` Main signatory: ${detail.approverNames[stage.key]}.`
              : ""}
            {detail.assistantNames[stage.key]
              ? ` Assigned alternate: ${detail.assistantNames[stage.key]}; that account must sign in to complete this stage.`
              : " No alternate signatory is currently assigned. Ask the administrator to assign one in Profile settings."}
          </span>
        </div>
      )}

      {myTurn && stage && (
        <ActionPanel
          detail={detail}
          stageKey={stage.key}
          viewer={viewer}
          isProxySigner={isProxySigner}
        />
      )}
      <StageStepper r={r} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Section title="Request details">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Request Number" comfortable>
                <span className="font-medium">{r.number}</span>
              </Field>
              <Field label="Date" comfortable>
                <span className="font-medium">{fmtDate(r.createdAt)}</span>
              </Field>
              <Field label="Requisitioner" comfortable>
                <span className="font-medium">{r.requisitionerName}</span>
              </Field>
              <Field label="Department / Office" comfortable>
                <span className="font-medium">{r.department}</span>
              </Field>
              <Field label="Destination" comfortable>
                <span className="font-medium">
                  {r.destinations.length > 1 ? (
                    <ol className="list-decimal pl-4">
                      {r.destinations.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ol>
                  ) : (
                    r.destinations[0]
                  )}
                </span>
              </Field>
              <Field label="No. of Passengers" comfortable>
                <span className="font-medium">{r.passengers}</span>
              </Field>
              <Field label="Date Needed" comfortable>
                <span className="font-medium">{fmtRange(r.dateStart, r.dateEnd)}</span>
              </Field>
              <Field label="Time Needed" comfortable>
                <span className="font-medium">{fmtTime(r.timeNeeded)}</span>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Purpose of Travel" comfortable>
                  <span className="font-medium">{r.purpose}</span>
                </Field>
              </div>
            </dl>
          </Section>

          <Section title="Review and approval signatures">
            <div className="grid gap-3 sm:grid-cols-3">
              {STAGES.map((st) => {
                const signature = sigs.find((x) => x.stage === st.key);
                return (
                  <div key={st.key} className="min-w-0 rounded-sm border p-3">
                    <p className="break-words text-[13px] font-semibold uppercase tracking-wide">
                      {st.label}
                    </p>
                    <p className="break-words text-[13px] text-muted-foreground">{st.title}</p>
                    <div className="mt-2 flex min-h-12 items-center">
                      {signature ? (
                        isOwner ? (
                          <div className="flex min-w-0 items-center gap-2 rounded-sm bg-success-soft px-2.5 py-2 text-[13px] font-medium text-success">
                            <BadgeCheck className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="break-words">Signature securely recorded</span>
                          </div>
                        ) : (
                          <SignatureMark
                            image={signature.image}
                            method={signature.method}
                            name={signature.proxySignerName ?? signature.signerName}
                          />
                        )
                      ) : (
                        <span className="text-[13px] text-muted-foreground">Not yet signed</span>
                      )}
                    </div>
                    {signature && (
                      <p className="mt-1 break-words text-[13px]">
                        <strong>{signature.proxySignerName ?? signature.signerName}</strong>
                        {signature.proxySignerName && (
                          <>
                            <br />
                            Alternate signatory for {st.title}
                          </>
                        )}
                        <br />
                        {fmtDateTime(signature.at)}
                      </p>
                    )}
                    {st.key === "review" && (
                      <dl className="mt-2 space-y-0.5 border-t pt-2 text-[13px]">
                        <div>
                          <dt className="inline text-muted-foreground">Vehicle Type: </dt>
                          <dd className="inline">{r.vehicleType ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="inline text-muted-foreground">Plate No.: </dt>
                          <dd className="inline">{r.plateNo ?? "—"}</dd>
                        </div>
                        {r.reviewRemarks && (
                          <div>
                            <dt className="inline text-muted-foreground">Remarks: </dt>
                            <dd className="inline">{r.reviewRemarks}</dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
        <Section title="Activity history">
          <HistoryList
            r={r}
            tripTicketPending={
              isOwner &&
              ["approved", "dispatched", "completed"].includes(r.status) &&
              !detail.tripTicketAttached
            }
          />
        </Section>
      </div>
    </div>
  );
}

function ActionPanel({
  detail,
  stageKey,
  viewer,
  isProxySigner,
}: {
  detail: RequestDetail;
  stageKey: StageKey;
  viewer: Viewer;
  isProxySigner: boolean;
}) {
  const r = detail.request;
  const queryClient = useQueryClient();
  const stage = STAGES.find((x) => x.key === stageKey)!;
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState(r.vehicleId ?? "none");
  const [vehicleType, setVehicleType] = useState(r.vehicleType ?? "");
  const [plateNo, setPlateNo] = useState(r.plateNo ?? "");
  const [driverName, setDriverName] = useState(r.dispatch.driverName ?? "");
  const [remarks, setRemarks] = useState("");
  const vehicle = detail.vehicles.find((v) => v.id === vehicleId);
  const warnings = useMemo(
    () => vehicleWarnings(vehicle, r, detail.conflictCandidates),
    [vehicle, r, detail.conflictCandidates],
  );
  const previous = currentSignatures(r).at(-1);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["request", r.id] }),
      queryClient.invalidateQueries({ queryKey: ["requests"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  }

  async function onApprove(signature: SignatureValue) {
    const result = await approveRequestFn({
      data: {
        id: r.id,
        signature,
        proxySigner: isProxySigner,
        ...(stageKey === "review" ? { driverName } : {}),
        vehicleId: vehicleId === "none" ? null : vehicleId,
        vehicleType,
        plateNo,
        remarks,
      },
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setApproveOpen(false);
    toast.success(
      stageKey === "approve"
        ? "Request approved. The trip ticket is ready to send."
        : "Signed and forwarded to the next approver.",
    );
    if (result.data.workflowEmail?.sent) {
      toast.success("Test approval email sent to mj.turingan@lyceumalabang.edu.ph.");
    } else if (result.data.workflowEmail) {
      toast.error(
        `Approval was saved, but the test email was not sent: ${result.data.workflowEmail.message}`,
      );
    }
    await refresh();
  }

  async function onReject(reason: string) {
    const result = await rejectRequestFn({ data: { id: r.id, reason } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setRejectOpen(false);
    toast.success("Request returned to the requisitioner.");
    if (result.data.workflowEmail?.sent) {
      toast.success("Test return email sent to mj.turingan@lyceumalabang.edu.ph.");
    } else if (result.data.workflowEmail) {
      toast.error(
        `Request was returned, but the test email was not sent: ${result.data.workflowEmail.message}`,
      );
    }
    await refresh();
  }

  return (
    <section className="panel min-w-0 border-primary/40" aria-label="Your action">
      <div className="border-b bg-info-soft px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {stage.label} · Your action is required
        </p>
      </div>
      <div className="min-w-0 space-y-4 p-4">
        {isProxySigner ? (
          <p className="rounded-sm border border-primary/30 bg-info-soft p-3 text-sm">
            You are the assigned alternate for the {stage.title}. You may sign or return this
            request using your own account; your name and action will be recorded in the request
            history.
          </p>
        ) : (
          <p className="rounded-sm border p-3 text-sm">
            <strong>Alternate signatory:</strong>{" "}
            {detail.assistantNames[stageKey] ?? "No alternate is assigned."}
            {detail.assistantNames[stageKey] &&
              " If you are unavailable, the assigned alternate signatory must use their own account to complete this stage."}
          </p>
        )}
        {stageKey === "approve" && (
          <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
            <Field label="Requisitioner">
              {r.requisitionerName} · {r.department}
            </Field>
            <Field label="Purpose">{r.purpose}</Field>
            <Field label="Destination">{r.destinations.join("; ")}</Field>
            <Field label="Passengers · Date · Time">
              {r.passengers} · {fmtRange(r.dateStart, r.dateEnd)} · {fmtTime(r.timeNeeded)}
            </Field>
            <Field label="Vehicle">
              {r.vehicleType
                ? `${r.vehicleType} · ${r.plateNo ?? "No plate recorded"}`
                : "Not yet assigned"}
            </Field>
            <Field label="Recommendation">
              {previous
                ? `Recommended by ${previous.signerName}, ${fmtDateTime(previous.at)}`
                : "—"}
            </Field>
          </dl>
        )}
        {stageKey === "recommend" && previous && (
          <p className="text-sm">
            Reviewed by <strong>{previous.signerName}</strong> (Head of Transport Services) on{" "}
            {fmtDateTime(previous.at)}
            {r.reviewRemarks ? <> — “{r.reviewRemarks}”</> : null}. Your signature recommends the
            request for approval; final approval rests with the President.
          </p>
        )}
        {stageKey === "review" && (
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 break-words text-sm sm:col-span-2">
              Reviewed By: <strong>{viewer.name}</strong>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <Label htmlFor="vehicle">Assign vehicle</Label>
              <Select
                value={vehicleId}
                onValueChange={(value) => {
                  setVehicleId(value);
                  const selected = detail.vehicles.find((v) => v.id === value);
                  setVehicleType(selected?.type ?? "");
                  setPlateNo(selected?.plateNo ?? "");
                }}
              >
                <SelectTrigger id="vehicle" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    Not assigned yet — enter manually or leave blank
                  </SelectItem>
                  {detail.vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.type} · {v.plateNo} · {v.capacity} seats
                      {v.status === "maintenance" ? " (maintenance)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {warnings.length > 0 && (
                <ul className="mt-2 space-y-1 rounded-sm border border-warning/40 bg-warning-soft p-2 text-sm">
                  {warnings.map((warning) => (
                    <li key={warning} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                      {warning}
                    </li>
                  ))}
                </ul>
              )}
              {vehicle && warnings.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  No conflicts found in recorded reservations. Confirm actual availability with the
                  motor pool.
                </p>
              )}
            </div>
            <div className="min-w-0">
              <Label htmlFor="vehicle-type">Vehicle Type</Label>
              <Input
                id="vehicle-type"
                className="mt-1"
                value={vehicleType}
                readOnly={Boolean(vehicle)}
                onChange={(event) => setVehicleType(event.target.value)}
              />
            </div>
            <div className="min-w-0">
              <Label htmlFor="plate-no">Plate No.</Label>
              <Input
                id="plate-no"
                className="mt-1"
                value={plateNo}
                readOnly={Boolean(vehicle)}
                onChange={(event) => setPlateNo(event.target.value)}
              />
            </div>
            <div className="min-w-0">
              <Label htmlFor="assigned-driver">Assigned Driver</Label>
              <Input
                id="assigned-driver"
                className="mt-1"
                maxLength={120}
                value={driverName}
                onChange={(event) => setDriverName(event.target.value)}
                placeholder="Enter the assigned driver's name"
              />
            </div>
            <div className="min-w-0 sm:col-span-2">
              <Label htmlFor="remarks">Review Remarks (optional)</Label>
              <Textarea
                id="remarks"
                rows={2}
                className="mt-1"
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
          <Button
            size="lg"
            className="w-full whitespace-normal leading-snug sm:w-auto sm:min-w-56"
            onClick={() => setApproveOpen(true)}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden /> {ACTION_LABEL[stageKey]}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full whitespace-normal leading-snug border-destructive/50 text-destructive hover:bg-danger-soft hover:text-destructive sm:w-auto"
            onClick={() => setRejectOpen(true)}
          >
            <CornerUpLeft className="h-4 w-4" aria-hidden />{" "}
            {stageKey === "approve" ? "Reject & Return" : "Reject & Return to Requisitioner"}
          </Button>
        </div>
        <p className="flex min-w-0 items-start gap-1.5 break-words text-xs text-muted-foreground">
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          The next person receives an in-app notification. Email delivery is not connected yet.
        </p>
      </div>

      <ApproveDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        request={r}
        user={viewer}
        proxySigner={isProxySigner}
        assistantName={detail.assistantNames[stageKey]}
        stageLabel={`${stage.label} — ${stage.title}`}
        actionLabel={ACTION_LABEL[stageKey]}
        onConfirm={onApprove}
      />
      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        stageTitle={stage.title}
        proxySigner={isProxySigner}
        onConfirm={onReject}
      />
    </section>
  );
}
