import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Clock,
  Download,
  FileText,
  Info,
  Mail,
  X,
  XCircle,
} from "lucide-react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingScreen } from "@/components/app/LoadingPanel";
import { PageHeader, Section, Field } from "@/components/app/PageHeader";
import { PermissionSlipReceipt } from "@/components/app/PermissionSlipReceipt";
import { SignaturePad, type SignatureValue } from "@/components/app/SignaturePad";
import { unwrap } from "@/lib/api";
import { isPermissionHead } from "@/lib/permission-access";
import { fmtDateTime } from "@/lib/format";
import type { PermissionSlip } from "@/server/permission";
import {
  approvePermissionSlipFn,
  getPermissionSlipFn,
  rejectPermissionSlipFn,
  sendPermissionSlipReceiptFn,
} from "@/server-functions";

type Search = {
  view?: "receipt" | undefined;
};

export const Route = createFileRoute("/_authenticated/permission-slips/$id")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    view: search["view"] === "receipt" ? "receipt" : undefined,
  }),
  component: PermissionSlipDetailPage,
});

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-PH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function Notice({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: "success" | "danger" | "info" | "warning";
  icon: typeof Info;
  title: string;
  children?: React.ReactNode;
}) {
  const cls = {
    success: "border-success/40 bg-success-soft",
    danger: "border-destructive/40 bg-danger-soft",
    info: "border-primary/30 bg-info-soft",
    warning: "border-warning/40 bg-warning-soft",
  }[tone];
  const ic = {
    success: "text-success",
    danger: "text-destructive",
    info: "text-primary",
    warning: "text-warning",
  }[tone];
  return (
    <div role="status" className={`flex min-w-0 gap-3 rounded-sm border p-3.5 ${cls}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${ic}`} aria-hidden />
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="font-semibold text-foreground">{title}</p>
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}

function PermissionStatusBadge({ status }: { status: PermissionSlip["status"] }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-sm border border-success/30 bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-sm border border-destructive/30 bg-danger-soft px-2.5 py-0.5 text-xs font-medium text-destructive">
        <XCircle className="h-3.5 w-3.5" aria-hidden /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-warning/30 bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning">
      <Clock className="h-3.5 w-3.5" aria-hidden /> Pending Approval
    </span>
  );
}

function PermissionSlipDetailPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { viewer } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const receiptRef = useRef<HTMLDivElement>(null);
  const isHead = isPermissionHead(viewer);

  const query = useQuery({
    queryKey: ["permission-slip", id],
    queryFn: () => unwrap(getPermissionSlipFn({ data: id })),
    refetchOnWindowFocus: true,
  });

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [signature, setSignature] = useState<SignatureValue | null>(null);
  const [confirmedAgreement, setConfirmedAgreement] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [receiptEmailedLocally, setReceiptEmailedLocally] = useState(false);

  const slip = query.data;
  const isApproved = slip?.status === "approved";
  const isPendingReview = isHead && slip?.status === "pending_approval";
  const hrDirectorName = slip?.departmentHeadName || viewer?.name || "HRDO Director";

  const emailAlreadyDelivered =
    receiptEmailedLocally ||
    Boolean(
      slip?.history.some(
        (h) =>
          h.message.toLowerCase().includes("receipt sent") ||
          h.message.toLowerCase().includes("receipt emailed") ||
          h.message.toLowerCase().includes("via gmail"),
      ),
    );

  async function handleApprove() {
    if (!slip || !signature) {
      toast.error("Please add your electronic signature before approving.");
      return;
    }
    setBusy(true);
    try {
      await unwrap(
        approvePermissionSlipFn({
          data: {
            id: slip.id,
            signature: signature.image,
            sendEmail: false,
          },
        }),
      );
      toast.success("Permission Slip approved. Proceeding to official receipt.");
      setApproveOpen(false);
      setSignature(null);
      setConfirmedAgreement(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["permission-slip", id] }),
        queryClient.invalidateQueries({ queryKey: ["permission-slips"] }),
      ]);
      await navigate({ search: { view: "receipt" } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approval failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!slip || rejectionReason.trim().length < 5) {
      toast.error("Please provide a reason for rejection (at least 5 characters).");
      return;
    }
    setBusy(true);
    try {
      const result = await unwrap(
        rejectPermissionSlipFn({ data: { id: slip.id, reason: rejectionReason } }),
      );
      if (result.emailDelivery.sent) {
        toast.success("Permission Slip rejected and employee was notified.");
      } else {
        toast.warning(
          `Permission Slip rejected, but notification email was not sent: ${result.emailDelivery.message}`,
        );
      }
      setRejectOpen(false);
      setRejectionReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["permission-slip", id] }),
        queryClient.invalidateQueries({ queryKey: ["permission-slips"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rejection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function captureReceiptImage() {
    if (!receiptRef.current) throw new Error("Receipt preview is not ready.");
    return toPng(receiptRef.current, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      skipFonts: true,
    });
  }

  async function handleSendReceiptEmail() {
    if (!slip) return;
    setSendingReceipt(true);
    try {
      const receiptImage = await captureReceiptImage();
      const result = await unwrap(
        sendPermissionSlipReceiptFn({
          data: {
            id: slip.id,
            receiptImage,
          },
        }),
      );
      if (result.emailDelivery.sent) {
        setReceiptEmailedLocally(true);
        toast.success(`Permission Slip receipt emailed to ${slip.employeeEmail} via Gmail.`);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["permission-slip", id] }),
          queryClient.invalidateQueries({ queryKey: ["permission-slips"] }),
        ]);
      } else {
        toast.error(`Failed to send email: ${result.emailDelivery.message}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to email permission slip receipt.");
    } finally {
      setSendingReceipt(false);
    }
  }

  async function handleDownloadReceipt() {
    if (!slip) return;
    setDownloading(true);
    try {
      const image = await captureReceiptImage();
      const link = document.createElement("a");
      link.href = image;
      link.download = `Permission-Slip-${slip.employeeName.replace(/[^a-zA-Z0-9_-]/g, "_")}-${slip.requestedDate}.png`;
      link.click();
      toast.success("Permission Slip receipt downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download receipt.");
    } finally {
      setDownloading(false);
    }
  }

  if (query.isPending) return <LoadingScreen label="Loading Permission Slip" mode="inline" />;
  if (query.isError) {
    return (
      <div
        className="mx-auto max-w-2xl rounded-lg border border-destructive/30 bg-destructive/5 p-6"
        role="alert"
      >
        <p className="font-semibold text-destructive">We couldn&apos;t load this Permission Slip.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {query.error instanceof Error ? query.error.message : "Please try again."}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!slip) return <p className="text-sm text-destructive">Permission Slip not found.</p>;

  // RECEIPT VIEW (mapupunta sa receipt kung isesend ba tru gmail or nah)
  if (search.view === "receipt") {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {(busy || sendingReceipt || downloading) && (
          <LoadingScreen
            label={
              sendingReceipt
                ? "Sending receipt via Gmail"
                : downloading
                  ? "Preparing receipt download"
                  : "Processing"
            }
            mode="overlay"
            immediate
          />
        )}

        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            className="w-fit gap-2"
            onClick={() => void navigate({ search: { view: undefined } })}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Request Form
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => void handleDownloadReceipt()}
              disabled={downloading || sendingReceipt}
            >
              <Download className="h-4 w-4" />
              Download Receipt
            </Button>
            {isHead && (
              <Button
                className="gap-2"
                onClick={() => void handleSendReceiptEmail()}
                disabled={sendingReceipt || emailAlreadyDelivered}
              >
                <Mail className="h-4 w-4" />
                {emailAlreadyDelivered ? "Receipt Emailed" : "Send via Gmail"}
              </Button>
            )}
          </div>
        </div>

        {emailAlreadyDelivered ? (
          <Notice
            tone="success"
            icon={CheckCircle2}
            title="Receipt sent to employee's Gmail."
          >
            The official permission slip receipt was successfully delivered to {slip.employeeEmail}.
          </Notice>
        ) : (
          <Notice
            tone="info"
            icon={Info}
            title="Official Permission Slip Receipt"
          >
            {isHead
              ? `Review the signed document below. Choose "Send via Gmail" to deliver the softcopy to ${slip.employeeEmail}, or "Download Receipt" for local records.`
              : "Here is your official approved Permission Slip receipt. You can download or print it as needed."}
          </Notice>
        )}

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <PermissionSlipReceipt slip={slip} receiptRef={receiptRef} />
        </div>

      </div>
    );
  }

  // DEFAULT VIEW: REQUEST FORM & DETAILS (makikita muna ang details and information bago fillupan ng hr director)
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {busy && <LoadingScreen label="Processing request" mode="overlay" immediate />}

      <PageHeader
        title={`Permission Slip ${slip.id.slice(0, 8).toUpperCase()}`}
        description={
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <PermissionStatusBadge status={slip.status} />
            <span>Requested on {fmtDateTime(slip.requestedAt)}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="ghost">
              <Link to="/permission-slips">
                <ArrowLeft className="h-4 w-4" />
                Back to Permission Slips
              </Link>
            </Button>
            {isApproved && (
              <Button
                className="gap-2"
                onClick={() => void navigate({ search: { view: "receipt" } })}
              >
                <FileText className="h-4 w-4" />
                View Receipt / Send via Gmail
              </Button>
            )}
          </div>
        }
      />

      {isApproved && (
        <Notice
          tone="success"
          icon={CheckCircle2}
          title="Permission Slip has been approved."
        >
          {emailAlreadyDelivered
            ? `The official receipt was already emailed to ${slip.employeeEmail}.`
            : `The official receipt is ready. Use "View Receipt / Send via Gmail" above to open and send it.`}
        </Notice>
      )}

      {slip.status === "rejected" && slip.rejectionReason && (
        <Notice
          tone="danger"
          icon={XCircle}
          title="This Permission Slip was rejected."
        >
          <p>
            <strong>Reason:</strong> {slip.rejectionReason}
          </p>
          {slip.rejectedAt && (
            <p className="mt-0.5 text-xs">Rejected on {fmtDateTime(slip.rejectedAt)}</p>
          )}
        </Notice>
      )}

      {/* HR Director Action Panel (vehicle trip ticket style) */}
      {isPendingReview && (
        <section
          className="panel min-w-0 border-primary/40 bg-card shadow-sm"
          aria-label="Action required"
        >
          <div className="border-b bg-info-soft px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              HR Director Review · Action Required
            </p>
          </div>
          <div className="space-y-4 p-4 sm:p-5">
            <p className="text-sm text-foreground">
              Review the employee&apos;s request information below. When ready, click{" "}
              <strong>Sign &amp; Approve</strong> to record your approval signature as{" "}
              <strong>{hrDirectorName}</strong>, or <strong>Reject Request</strong> if it cannot be
              approved.
            </p>
            <div className="flex flex-wrap gap-3 border-t pt-3">
              <Button
                size="lg"
                className="gap-2 sm:min-w-64"
                onClick={() => setApproveOpen(true)}
              >
                <CheckCircle2 className="h-4 w-4" />
                Sign &amp; Approve Permission Slip
              </Button>
              <Button
                variant="destructive"
                className="gap-2"
                onClick={() => setRejectOpen(true)}
              >
                <X className="h-4 w-4" />
                Reject Request
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Request Details Section (makikita muna ang information na finillupan nung kumuha ng permission) */}
      <Section title="Request Details">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee Name" comfortable>
            <span className="font-medium text-foreground">{slip.employeeName}</span>
          </Field>
          <Field label="Department / Office" comfortable>
            <span className="font-medium text-foreground">{slip.department}</span>
          </Field>
          <Field label="Employee Email" comfortable>
            <span className="font-medium text-foreground">{slip.employeeEmail}</span>
          </Field>
          <Field label="Requested Date" comfortable>
            <span className="font-medium text-foreground">{formatDate(slip.requestedDate)}</span>
          </Field>
          <Field label="Time Out" comfortable>
            <span className="font-medium text-foreground">{slip.timeOut}</span>
          </Field>
          <Field label="Time In" comfortable>
            <span className="font-medium text-foreground">{slip.timeIn}</span>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Reason for Going Out" comfortable>
              <div className="mt-1 rounded-md border-l-4 border-l-amber-500 bg-amber-50/70 p-3.5 text-sm font-semibold text-slate-900 whitespace-pre-wrap">
                {slip.reason}
              </div>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Employee Signature" comfortable>
              <div className="mt-2 flex min-h-24 max-w-sm items-center justify-center rounded-md border border-slate-300 bg-white p-2">
                <img
                  src={slip.employeeSignature}
                  alt={`Signature of ${slip.employeeName}`}
                  className="max-h-20 max-w-full object-contain"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Electronically signed by <strong>{slip.employeeName}</strong>
              </p>
            </Field>
          </div>
          {slip.departmentHeadSignature && (
            <div className="sm:col-span-2">
              <Field label="Approved By (HR Director)" comfortable>
                <div className="mt-1 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">{hrDirectorName}</p>
                    {slip.approvedAt && (
                      <p className="text-xs text-muted-foreground">
                        Approved on {fmtDateTime(slip.approvedAt)}
                      </p>
                    )}
                  </div>
                </div>
              </Field>
            </div>
          )}
        </dl>
      </Section>

      {/* Activity History Section */}
      <Section title="Activity History">
        {slip.history && slip.history.length > 0 ? (
          <div className="space-y-3">
            {slip.history.map((event) => (
              <div key={event.id} className="flex items-start gap-3 text-sm">
                <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{event.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.actorName} · {fmtDateTime(event.happenedAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        )}
      </Section>

      {/* Approve Dialog (vehicle trip ticket style ApproveDialog) */}
      <Dialog
        open={approveOpen}
        onOpenChange={(open) => {
          if (!busy) {
            setApproveOpen(open);
            if (!open) {
              setSignature(null);
              setConfirmedAgreement(false);
            }
          }
        }}
      >
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto p-4 sm:w-full sm:max-w-lg sm:p-6">
          <DialogHeader>
            <DialogTitle>HR Director Approval</DialogTitle>
            <DialogDescription>
              Review the details and sign below to approve this Permission Slip.
            </DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-sm border bg-muted/40 p-3 text-xs sm:text-sm">
            <dt className="text-muted-foreground">Employee</dt>
            <dd className="font-medium text-foreground">{slip.employeeName}</dd>
            <dt className="text-muted-foreground">Department</dt>
            <dd className="text-foreground">{slip.department}</dd>
            <dt className="text-muted-foreground">Date</dt>
            <dd className="text-foreground">{formatDate(slip.requestedDate)}</dd>
            <dt className="text-muted-foreground">Time</dt>
            <dd className="text-foreground">
              {slip.timeOut} — {slip.timeIn}
            </dd>
            <dt className="text-muted-foreground col-span-2 mt-1">Reason</dt>
            <dd className="col-span-2 font-medium text-foreground">{slip.reason}</dd>
          </dl>

          <div className="min-w-0 space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              HR Director Approval Signature
            </Label>
            <SignaturePad onChange={setSignature} />
            <p className="text-xs text-muted-foreground">
              Signing as <strong className="text-foreground">{hrDirectorName}</strong>. This name
              will appear under &ldquo;Signature over Printed Name&rdquo;.
            </p>
          </div>

          <div className="flex items-start gap-2 pt-1">
            <Checkbox
              id="confirm-permission-approval"
              checked={confirmedAgreement}
              onCheckedChange={(checked) => setConfirmedAgreement(checked === true)}
            />
            <Label
              htmlFor="confirm-permission-approval"
              className="text-xs font-normal leading-snug text-foreground sm:text-sm"
            >
              I confirm my approval as HR Director for this permission slip.
            </Label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setApproveOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              disabled={!signature || !confirmedAgreement || busy}
              onClick={() => void handleApprove()}
            >
              {busy ? "Saving Approval…" : "Confirm & Sign Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog (vehicle trip ticket style RejectDialog) */}
      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          if (!busy) {
            setRejectOpen(open);
            if (!open) setRejectionReason("");
          }
        }}
      >
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] overflow-y-auto p-4 sm:w-full sm:max-w-lg sm:p-6">
          <DialogHeader>
            <DialogTitle>Reject Permission Slip</DialogTitle>
            <DialogDescription>
              State the reason why this Permission Slip cannot be approved.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="permission-rejection-reason" className="text-xs font-semibold">
              Reason for rejection (required)
            </Label>
            <Textarea
              id="permission-rejection-reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
              placeholder="Explain clearly why this request is returned or rejected."
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setRejectOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={rejectionReason.trim().length < 5 || busy}
              onClick={() => void handleReject()}
            >
              {busy ? "Rejecting…" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}