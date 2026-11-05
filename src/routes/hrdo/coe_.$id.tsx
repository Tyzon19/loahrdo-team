import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock3,
  Download,
  FileDown,
  FileCheck2,
  Info,
  RefreshCw,
  Send,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, Field, PageHeader, Section } from "@/components/app/PageHeader";
import { ButtonLoading, LoadingPanel } from "@/components/app/LoadingPanel";
import { CoeStatusBadge } from "@/components/hrdo/CoeStatusBadge";
import { CoeDeadlineNote } from "@/components/hrdo/CoeDeadline";
import { CoeHistoryList } from "@/components/hrdo/CoeHistoryList";
import {
  getCoeDocumentFn,
  getCoeRequestFn,
  generateCoeTemplateFn,
  markCoeReadyFn,
  rejectCoeRequestFn,
  releaseCoeDocumentFn,
  requestCoeCorrectionFn,
  resubmitCoeRequestFn,
  sendCoeTemplateFn,
  startCoeProcessingFn,
  uploadCoeDocumentFn,
  verifyCoeRequestFn,
} from "@/server-functions";
import { unwrap } from "@/lib/api";
import {
  COE_COPY_TYPES,
  COE_COPY_TYPE_HINTS,
  COE_COPY_TYPE_LABELS,
  COE_DOCUMENT_MIMES,
  COE_MAX_DOCUMENT_BYTES,
  COE_REQUESTOR_STATUS_LABELS,
  COE_STATUS_HINTS,
  COE_STATUS_LABELS,
  compensationAmountToWords,
  coeCanDownloadDocument,
  coeNeedsDocument,
  coeRequestsCompensation,
  coeReference,
  coeStaffActions,
  type CoeAction,
  type CoeCopyType,
  type CoeRequest,
  type CoeStatus,
} from "@/lib/hrdo";
import { fmtDateTime } from "@/lib/format";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/hrdo/coe_/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `COE Request ${params.id.slice(0, 8).toUpperCase()} — ${SITE.name}` },
      {
        name: "description",
        content: "View and process a Certificate of Employment request.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CoeDetailPage,
});


const ACTION_LABELS: Record<CoeAction, string> = {
  verify: "Verify information",
  process: "Start processing",
  request_correction: "Request correction",
  upload_document: "Upload signed document",
  mark_ready: "Mark ready for pickup",
  release: "Record release",
  reject: "Reject request",
};

function actionLabel(key: CoeAction, status: CoeStatus) {
  return key === "process" && status === "awaiting_review"
    ? "Resume processing"
    : ACTION_LABELS[key];
}

const ACTION_SUCCESS: Record<ActionPayload["kind"], string> = {
  verify: "Employee information verified.",
  process: "COE preparation started.",
  correction: "The employee has been asked to correct the request.",
  upload: "Signed COE uploaded.",
  ready: "Request marked ready for pickup.",
  release: "Document release recorded.",
  reject: "Request rejected.",
};

const OTHER_PURPOSE_OPTION = "Other (Please Specify)" as const;

const COE_PURPOSE_OPTIONS = [
  "Bank / Loan Application",
  "Credit Card Application",
  "Visa / Immigration",
  "Travel Requirements",
  "Employment Verification",
  "Government Requirements",
  "Housing / Rental Application",
  "Personal Records",
  OTHER_PURPOSE_OPTION,
] as const;

function formatRequestNote(note: string) {
  const lines = note.split("\n");
  const metadataIndex = lines.findIndex((line) => /(?:^|\| )Requestor type:/.test(line));
  const customNote =
    metadataIndex > 0 ? lines.slice(0, metadataIndex).join("\n") : metadataIndex === -1 ? note : "";
  const metadata = metadataIndex >= 0 ? lines.slice(metadataIndex).join("\n") : lines.join("\n");
  const fields = metadata
    ? metadata.split(/\s*\|\s*/).flatMap((part) => {
        const separator = part.indexOf(": ");
        return separator === -1
          ? []
          : [[part.slice(0, separator), part.slice(separator + 2)] as const];
      })
    : [];
  return { customNote, fields };
}

function requestNoteValue(note: string, label: string) {
  const field = note
    .split(/\s*\|\s*/)
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(`${label.toLowerCase()}:`));
  return field?.slice(label.length + 1).trim() ?? "";
}

function requestEmploymentDate(note: string, label: string) {
  const value = requestNoteValue(note, label);
  return value.toLowerCase() === "present" || value.toLowerCase() === "not provided" ? "" : value;
}

function normalizePurposeChoice(value: string) {
  return COE_PURPOSE_OPTIONS.includes(value as (typeof COE_PURPOSE_OPTIONS)[number])
    ? value
    : OTHER_PURPOSE_OPTION;
}

type ActionPayload =
  | { kind: "verify" }
  | { kind: "process" }
  | { kind: "correction"; message: string }
  | { kind: "reject"; remarks: string }
  | { kind: "upload"; fileName: string; dataUrl: string }
  | { kind: "ready" }
  | { kind: "release"; receivedByName: string };

interface CoeTemplatePayload {
  id: string;
  employeeName: string;
  dateHired: string;
  employmentEndDate: string;
  position: string;
  department: string;
  compensationWords: string;
  compensationAmount: string;
  purpose: string;
  issueDate: string;
  preparedByName: string;
  includeCompensation: boolean;
}

interface CoeTemplatePreview {
  payload: CoeTemplatePayload;
  fileName: string;
  mime: string;
  base64: string;
}

function saveBase64File(fileName: string, mime: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = window.document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function CoeDetailPage() {
  const { id } = Route.useParams();
  const { hrdoViewer } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const isStaff = hrdoViewer?.role === "hrdo_staff";

  const [active, setActive] = useState<CoeAction | null>(null);
  const [correction, setCorrection] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [file, setFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<CoeTemplatePreview | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [templateFields, setTemplateFields] = useState({
    employeeName: "",
    dateHired: "",
    employmentEndDate: "",
    position: "",
    department: "",
    compensationAmount: "",
    purpose: "",
    issueDate: new Date().toISOString().slice(0, 10),
    preparedByName: "",
  });

  const query = useQuery({
    queryKey: ["coe", "request", id],
    queryFn: () => unwrap(getCoeRequestFn({ data: { id } })),
    refetchOnWindowFocus: true,
  });

  const action = useMutation({
    mutationFn: async (payload: ActionPayload): Promise<CoeRequest> => {
      switch (payload.kind) {
        case "verify":
          return unwrap(verifyCoeRequestFn({ data: { id } }));
        case "process":
          return unwrap(startCoeProcessingFn({ data: { id } }));
        case "correction":
          return unwrap(requestCoeCorrectionFn({ data: { id, message: payload.message } }));
        case "reject":
          return unwrap(rejectCoeRequestFn({ data: { id, remarks: payload.remarks } }));
        case "upload":
          return unwrap(
            uploadCoeDocumentFn({
              data: { id, fileName: payload.fileName, dataUrl: payload.dataUrl },
            }),
          );
        case "ready":
          return unwrap(markCoeReadyFn({ data: { id } }));
        case "release":
          return unwrap(
            releaseCoeDocumentFn({ data: { id, receivedByName: payload.receivedByName } }),
          );
      }
    },
    onSuccess: async (_result, payload) => {
      toast.success(ACTION_SUCCESS[payload.kind]);
      setActive(payload.kind === "process" ? "process" : null);
      setCorrection("");
      setReceivedBy("");
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: ["coe"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "We couldn't update this request.");
    },
  });

  if (!hrdoViewer) return null;

  if (query.isPending) {
    return (
      <>
        <PageHeader title="COE request details" description="Loading the latest record…" />
        <LoadingPanel label="Loading COE request" rows={6} />
      </>
    );
  }

  if (query.isError) {
    return (
      <Section title="COE request details">
        <div className="p-6 text-center" role="alert">
          <p className="font-medium">We couldn&apos;t load this COE request.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {query.error instanceof Error
              ? query.error.message
              : "Check your connection and try again."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => void query.refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Try again
            </Button>
            <Button asChild variant="ghost">
              <Link to={isStaff ? "/hrdo/requests" : "/hrdo/coe"}>
                {isStaff ? "Back to COE Requests" : "New COE Request"}
              </Link>
            </Button>
          </div>
        </div>
      </Section>
    );
  }

  const request = query.data;
  if (!request) {
    return (
      <Section title="COE request not found">
        <EmptyState title="We couldn't find this COE request.">
          It may have been removed, or it does not belong to your account.{" "}
          <Link to={isStaff ? "/hrdo/requests" : "/hrdo/coe"} className="text-primary underline">
            Go to COE request form
          </Link>
        </EmptyState>
      </Section>
    );
  }

  const actions = isStaff ? coeStaffActions(request) : [];
  const canDownload = coeCanDownloadDocument(request, isStaff ? "staff" : "requestor");
  const isThirdPartyVerifier = /(?:^|\| )Requestor type: Third-Party Verifier/i.test(request.note);
  const includesCompensation = coeRequestsCompensation(request.note);
  const viewerName = hrdoViewer.name;

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    const extension = selected.name.split(".").pop()?.toLowerCase();
    const mime =
      extension === "pdf"
        ? COE_DOCUMENT_MIMES.pdf
        : extension === "docx"
          ? COE_DOCUMENT_MIMES.docx
          : "";
    if (!mime || (selected.type && selected.type !== mime)) {
      toast.error("Choose the signed COE as a PDF or Word (.docx) file.");
      return;
    }
    if (selected.size > COE_MAX_DOCUMENT_BYTES) {
      toast.error("The signed COE must be 5 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result).replace(/^data:[^;,]*;base64,/, `data:${mime};base64,`);
      setFile({ name: selected.name, dataUrl });
    };
    reader.onerror = () => toast.error("We couldn't read that file. Try another copy.");
    reader.readAsDataURL(selected);
  }

  function templatePayload(): CoeTemplatePayload {
    return {
      id,
      employeeName: templateFields.employeeName.trim() || request.employeeName,
      dateHired:
        templateFields.dateHired.trim() || requestEmploymentDate(request.note, "Date hired"),
      employmentEndDate:
        templateFields.employmentEndDate.trim() ||
        requestEmploymentDate(request.note, "Employment end date"),
      position: templateFields.position,
      department:
        templateFields.department.trim() ||
        (isThirdPartyVerifier
          ? ""
          : requestNoteValue(request.note, "Department") || request.department),
      compensationWords: compensationAmountToWords(templateFields.compensationAmount),
      compensationAmount: templateFields.compensationAmount,
      purpose: templateFields.purpose.trim() || request.purpose,
      issueDate: templateFields.issueDate,
      preparedByName: templateFields.preparedByName.trim() || viewerName,
      includeCompensation: includesCompensation,
    };
  }

  async function generateTemplate() {
    setGenerating(true);
    try {
      const payload = templatePayload();
      const result = await unwrap(generateCoeTemplateFn({ data: payload }));
      saveBase64File(result.fileName, result.mime, result.base64);
      setPreview({ payload, ...result });
      setSentTo("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "We couldn't generate the COE template.",
      );
    } finally {
      setGenerating(false);
    }
  }

  function downloadPreview() {
    if (!preview) return;
    saveBase64File(preview.fileName, preview.mime, preview.base64);
  }

  async function sendTemplate() {
    if (!preview) return;
    setSending(true);
    try {
      const result = await unwrap(sendCoeTemplateFn({ data: preview.payload }));
      setPreview(null);
      setSentTo(result.recipientEmail);
      setActive(null);
      toast.success(`Word template sent to ${result.recipientEmail}.`);
      await queryClient.invalidateQueries({ queryKey: ["coe"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't send the COE template.");
    } finally {
      setSending(false);
    }
  }

  async function downloadDocument() {
    setDownloading(true);
    try {
      const document = await unwrap(getCoeDocumentFn({ data: { id } }));
      saveBase64File(document.fileName, document.mime, document.base64);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't download the signed COE.");
    } finally {
      setDownloading(false);
    }
  }

  const templateInputs: [string, string, string][] = [
    ["employeeName", "Employee name", request.employeeName],
    ["dateHired", "Date hired", requestEmploymentDate(request.note, "Date hired")],
    ...(isThirdPartyVerifier
      ? [
          [
            "employmentEndDate",
            "Last day of employment",
            requestEmploymentDate(request.note, "Employment end date"),
          ] as [string, string, string],
        ]
      : []),
    ["position", "Position / designation", ""],
    ...(includesCompensation
      ? ([["compensationAmount", "Compensation amount", ""]] as [string, string, string][])
      : []),
    ["purpose", "Purpose", request.purpose],
    ["issueDate", "Issue date", templateFields.issueDate],
    ["preparedByName", "Prepared by", viewerName],
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={`COE Request ${coeReference(request.id)}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <CoeStatusBadge status={request.status} audience={isStaff ? "staff" : "requestor"} />
            <span>Submitted {fmtDateTime(request.requestedAt)}</span>
          </span>
        }
        actions={
          <Button asChild variant="outline">
            <Link to={isStaff ? "/hrdo/requests" : "/hrdo/coe"}>
              {isStaff ? "Back to COE Requests" : "New COE Request"}
            </Link>
          </Button>
        }
      />

      <StatusNotice
        status={request.status}
        remarks={request.remarks}
        correctionMessage={request.correctionMessage}
        audience={isStaff ? "staff" : "requestor"}
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Section title="COE Request Details">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Request ID" comfortable>
                <span className="font-mono text-[13px] font-medium">{request.id}</span>
              </Field>
              <Field label="Date Requested" comfortable>
                <span className="font-medium">{fmtDateTime(request.requestedAt)}</span>
              </Field>
              <Field label="Name of requestor" comfortable>
                <span className="font-medium">{request.employeeName}</span>
              </Field>
              <Field label="Employee ID" comfortable>
                <span className="font-medium">{request.employeeNumber || "—"}</span>
              </Field>
              <Field label="Email Address" comfortable>
                <span className="font-medium">{request.employeeEmail}</span>
              </Field>
              <Field label="Department / Office" comfortable>
                <span className="font-medium">{request.department || "—"}</span>
              </Field>
              <Field label="Type of Copy" comfortable>
                <span className="font-medium">{COE_COPY_TYPE_LABELS[request.copyType]}</span>
              </Field>
              <Field label="Deadline" comfortable>
                <span className="font-medium">
                  {fmtDateTime(request.deadlineAt)}
                  <span className="mt-1 block">
                    <CoeDeadlineNote deadlineAt={request.deadlineAt} status={request.status} />
                  </span>
                </span>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Purpose of Request" comfortable>
                  <span className="font-medium">{request.purpose}</span>
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Additional Note" comfortable>
                  {request.note ? (
                    <div className="space-y-3">
                      {formatRequestNote(request.note).customNote && (
                        <p className="whitespace-pre-line font-medium">
                          {formatRequestNote(request.note).customNote}
                        </p>
                      )}
                      {formatRequestNote(request.note).fields.length > 0 && (
                        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                          {formatRequestNote(request.note).fields.map(([label, value]) => (
                            <div key={label} className="min-w-0">
                              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {label}
                              </dt>
                              <dd className="mt-0.5 whitespace-pre-line break-words font-medium">
                                {value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                  ) : (
                    <span className="font-medium">No additional note was provided.</span>
                  )}
                </Field>
              </div>
              {request.remarks && (
                <div className="sm:col-span-2">
                  <Field label="HRDO Remarks" comfortable>
                    <span className="whitespace-pre-line font-medium">{request.remarks}</span>
                  </Field>
                </div>
              )}
            </dl>
          </Section>

          {isStaff && active === "process" && (
            <Dialog
              open={active === "process"}
              onOpenChange={(open) => {
                if (!open) setActive(null);
              }}
            >
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle>COE template details</DialogTitle>
                  <DialogDescription>
                    Fill in the details and generate the Word template, then email it to the
                    requestor. If the filled template is not correct, edit the Word file before
                    sending it.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {templateInputs.map(([keyName, label, placeholder]) => (
                      <div key={keyName}>
                        <Label htmlFor={`template-${keyName}`}>{label}</Label>
                        <Input
                          id={`template-${keyName}`}
                          className="mt-1"
                          type={
                            keyName === "issueDate" ||
                            keyName === "dateHired" ||
                            keyName === "employmentEndDate"
                              ? "date"
                              : "text"
                          }
                          value={
                            templateFields[keyName as keyof typeof templateFields] ||
                            (keyName === "dateHired" || keyName === "employmentEndDate"
                              ? placeholder
                              : "")
                          }
                          placeholder={placeholder}
                          required={isThirdPartyVerifier && keyName === "employmentEndDate"}
                          onChange={(event) => {
                            setTemplateFields((current) => ({
                              ...current,
                              [keyName]: event.target.value,
                            }));
                            setPreview(null);
                            setSentTo("");
                          }}
                        />
                      </div>
                    ))}
                    <div>
                      <Label htmlFor="template-department">Department / office</Label>
                      <Input
                        id="template-department"
                        className="mt-1"
                        value={
                          templateFields.department ||
                          (isThirdPartyVerifier
                            ? ""
                            : requestNoteValue(request.note, "Department") || request.department)
                        }
                        placeholder={
                          isThirdPartyVerifier
                            ? "Enter the former employee's department / office"
                            : "Department / office"
                        }
                        onChange={(event) => {
                          setTemplateFields((current) => ({
                            ...current,
                            department: event.target.value,
                          }));
                          setPreview(null);
                          setSentTo("");
                        }}
                      />
                    </div>
                  </div>{" "}
                  <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {request.status !== "processing" && (
                        <Button
                          type="button"
                          className="sm:flex-1"
                          disabled={action.isPending}
                          onClick={() => action.mutate({ kind: "process" })}
                        >
                          {action.isPending
                            ? request.status === "awaiting_review"
                              ? "Resuming processing…"
                              : "Starting processing…"
                            : request.status === "awaiting_review"
                              ? "Resume processing"
                              : "Start processing"}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        className="sm:flex-1"
                        onClick={() => void generateTemplate()}
                        disabled={request.status !== "processing" || generating}
                      >
                        <FileDown className="h-4 w-4" aria-hidden />
                        {generating ? "Generating…" : "Generate Word template"}
                      </Button>
                      <Button
                        type="button"
                        className="sm:flex-1"
                        onClick={() => void sendTemplate()}
                        disabled={
                          request.status !== "processing" || !preview || sending || generating
                        }
                      >
                        <Send className="h-4 w-4" aria-hidden />
                        {sending ? "Sending…" : "Send Word file to requestor"}
                      </Button>
                    </div>
                    {sentTo ? (
                      <p className="text-xs text-muted-foreground" role="status">
                        Sent to {sentTo}. Generate a new copy before sending again.
                      </p>
                    ) : preview ? (
                      <div className="space-y-1">
                        {" "}
                        <p className="text-xs text-muted-foreground">
                          Review copy ready:{" "}
                          <span className="font-medium text-foreground">{preview.fileName}</span>
                          {" · "}
                          <button
                            type="button"
                            className="text-primary underline underline-offset-2"
                            onClick={downloadPreview}
                          >
                            Download again
                          </button>
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Generating only downloads the file for review. Nothing is emailed until you
                        press Send Word file to requestor.
                      </p>
                    )}
                  </div>
                  <Button asChild type="button" variant="outline" className="w-full">
                    <a href="/COE%20FORMAT.docx" download="COE FORMAT.docx">
                      <FileDown className="h-4 w-4" aria-hidden />
                      Download blank COE template
                    </a>
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {isStaff && request.status === "correction_requested" && (
            <Section title="Waiting for the employee">
              <p className="text-sm text-muted-foreground">
                HRDO requested a correction on {fmtDateTime(request.correctionRequestedAt)}. The
                original submission date and deadline stay unchanged when the employee resubmits.
              </p>
              {request.correctionMessage && (
                <p className="mt-2 whitespace-pre-line break-words rounded-sm border bg-muted/40 p-3 text-sm">
                  {request.correctionMessage}
                </p>
              )}
            </Section>
          )}

          <Section title="Request history">
            <CoeHistoryList
              entries={request.history}
              empty="No history has been recorded for this request yet."
            />
          </Section>
        </div>

        <div className="min-w-0 space-y-4">
          <Section title="Processing status">
            <div className="space-y-3 text-sm">
              <CoeStatusBadge status={request.status} audience={isStaff ? "staff" : "requestor"} />
              <p className="text-muted-foreground">
                {isStaff ? staffHint(request.status) : COE_STATUS_HINTS[request.status]}
              </p>
              <dl className="space-y-2 border-t pt-3">
                <Field label="Submitted">{fmtDateTime(request.requestedAt)}</Field>
                <Field label="Last updated">{fmtDateTime(request.updatedAt)}</Field>
                <Field label="Handled by">
                  {request.processedByName || "Not yet assigned to HRDO staff"}
                </Field>
                {request.verifiedAt && (
                  <Field label="Verified">
                    {fmtDateTime(request.verifiedAt)}
                    {request.verifiedByName ? ` · ${request.verifiedByName}` : ""}
                  </Field>
                )}
                {request.correctionRequestedAt && (
                  <Field label="Correction requested">
                    {fmtDateTime(request.correctionRequestedAt)}
                  </Field>
                )}
                {request.finalizedAt && (
                  <Field label="COE finalized">{fmtDateTime(request.finalizedAt)}</Field>
                )}
                {request.readyAt && (
                  <Field label="Ready for pickup">{fmtDateTime(request.readyAt)}</Field>
                )}
                {request.releasedAt && (
                  <Field label="Released">
                    {fmtDateTime(request.releasedAt)}
                    {request.releasedByName ? ` · ${request.releasedByName}` : ""}
                  </Field>
                )}
                {request.receivedByName && (
                  <Field label="Received by">{request.receivedByName}</Field>
                )}
              </dl>
            </div>
          </Section>

          <DocumentPanel
            request={request}
            isStaff={Boolean(isStaff)}
            canDownload={canDownload}
            downloading={downloading}
            onDownload={() => void downloadDocument()}
          />

          {isStaff && (
            <Section title="HRDO actions">
              {request.status === "processing" && (
                <Button
                  type="button"
                  className="mb-2 w-full justify-start"
                  onClick={() => setActive("process")}
                >
                  <FileCheck2 className="h-4 w-4" aria-hidden />
                  Open COE template details
                </Button>
              )}
              {actions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No action is available while this request is{" "}
                  {COE_STATUS_LABELS[request.status].toLowerCase()}.
                </p>
              ) : (
                <div className="space-y-2">
                  {actions.map((key) => (
                    <div key={key} className="min-w-0">
                      <Button
                        type="button"
                        variant={
                          key === "reject" ? "outline" : key === "release" ? "default" : "outline"
                        }
                        className="w-full justify-start"
                        aria-expanded={active === key}
                        onClick={() => {
                          setActive((current) => (current === key ? null : key));
                          setCorrection("");
                          setReceivedBy("");
                          setFile(null);
                        }}
                      >
                        {actionLabel(key, request.status)}
                      </Button>

                      {active === key && (
                        <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-3">
                          {key === "request_correction" && (
                            <>
                              <Label htmlFor="correction-message">Message to the requestor</Label>
                              <Textarea
                                id="correction-message"
                                className="min-h-24"
                                value={correction}
                                onChange={(event) => setCorrection(event.target.value)}
                                placeholder="State exactly what is missing or needs correction."
                                maxLength={2000}
                              />
                            </>
                          )}
                          {key === "reject" && (
                            <>
                              <Label htmlFor="reject-remarks">Reason for rejection</Label>
                              <Textarea
                                id="reject-remarks"
                                className="min-h-24"
                                value={correction}
                                onChange={(event) => setCorrection(event.target.value)}
                                placeholder="Explain why HRDO cannot process this request."
                                maxLength={2000}
                              />
                            </>
                          )}
                          {key === "release" && (
                            <>
                              <Label htmlFor="received-by">Received by</Label>
                              <Input
                                id="received-by"
                                value={receivedBy}
                                onChange={(event) => setReceivedBy(event.target.value)}
                                placeholder="Full name of the person claiming the COE"
                                maxLength={120}
                              />
                            </>
                          )}
                          {key === "upload_document" && (
                            <>
                              <Label htmlFor="coe-document">
                                Signed COE (PDF or Word .docx, max 5 MB)
                              </Label>
                              <Input
                                id="coe-document"
                                type="file"
                                accept={`.pdf,.docx,${COE_DOCUMENT_MIMES.pdf},${COE_DOCUMENT_MIMES.docx}`}
                                onChange={pickFile}
                              />
                              {file && (
                                <p className="break-words text-xs text-muted-foreground">
                                  {file.name} selected.
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {COE_COPY_TYPE_HINTS[request.copyType]}
                              </p>
                            </>
                          )}
                          {(key === "verify" || key === "process" || key === "mark_ready") && (
                            <div className="space-y-2 text-xs text-muted-foreground">
                              <p>
                                {key === "verify"
                                  ? "Confirm the name, Employee ID, department and employment details against HR records before continuing."
                                  : key === "process"
                                    ? request.status === "awaiting_review"
                                      ? "Resume COE preparation after the requestor reviews the filled Word template, then continue with signing and release."
                                      : "Start processing first, then prepare the COE, have it signed, and upload the signed document."
                                    : "The printed, signed COE is now waiting at the HRDO desk."}
                              </p>
                            </div>
                          )}

                          <Button
                            type="button"
                            className="w-full"
                            disabled={action.isPending}
                            onClick={() => {
                              if (key === "verify") action.mutate({ kind: "verify" });
                              else if (key === "process") action.mutate({ kind: "process" });
                              else if (key === "mark_ready") action.mutate({ kind: "ready" });
                              else if (key === "request_correction") {
                                if (correction.trim().length < 10) {
                                  toast.error("Explain what the employee needs to correct.");
                                  return;
                                }
                                action.mutate({ kind: "correction", message: correction.trim() });
                              } else if (key === "reject") {
                                if (correction.trim().length < 5) {
                                  toast.error("Give a reason for rejecting the request.");
                                  return;
                                }
                                action.mutate({ kind: "reject", remarks: correction.trim() });
                              } else if (key === "release") {
                                if (receivedBy.trim().length < 2) {
                                  toast.error("Record who received the document.");
                                  return;
                                }
                                action.mutate({
                                  kind: "release",
                                  receivedByName: receivedBy.trim(),
                                });
                              } else if (key === "upload_document") {
                                if (!file) {
                                  toast.error("Choose the signed COE document first.");
                                  return;
                                }
                                action.mutate({
                                  kind: "upload",
                                  fileName: file.name,
                                  dataUrl: file.dataUrl,
                                });
                              }
                            }}
                          >
                            {action.isPending ? (
                              <ButtonLoading label="Saving…" />
                            ) : (
                              actionLabel(key, request.status)
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {!isStaff && request.status === "correction_requested" && (
            <CorrectionForm request={request} />
          )}
        </div>
      </div>
    </div>
  );
}

function staffHint(status: CoeStatus) {
  const hints: Record<CoeStatus, string> = {
    pending: "New request. Verify the employee details, then start processing.",
    under_review: "Verify the employee details against official HR records.",
    correction_requested: "Waiting for the employee to submit the corrected details.",
    processing: "Prepare the COE, upload the signed document for soft copies, then release it.",
    awaiting_review: "Filled Word template sent. Resume processing after the requestor reviews it.",
    ready_for_pickup:
      "The printed COE is waiting at the HRDO desk. Record the release when claimed.",
    released: "This request is complete and recorded in the request history.",
    rejected: "This request was rejected. The employee must submit a new request.",
  };
  return hints[status];
}

function StatusNotice({
  status,
  remarks,
  correctionMessage,
  audience,
}: {
  status: CoeStatus;
  remarks: string;
  correctionMessage: string;
  audience: "staff" | "requestor";
}) {
  const tone =
    status === "rejected"
      ? "border-destructive/40 bg-danger-soft"
      : status === "correction_requested"
        ? "border-warning/40 bg-warning-soft"
        : status === "ready_for_pickup" || status === "released"
          ? "border-success/40 bg-success-soft"
          : "border-primary/30 bg-info-soft";
  const iconTone =
    status === "rejected"
      ? "text-destructive"
      : status === "correction_requested"
        ? "text-warning"
        : status === "ready_for_pickup" || status === "released"
          ? "text-success"
          : "text-primary";
  const Icon =
    status === "rejected"
      ? XCircle
      : status === "correction_requested"
        ? Info
        : status === "ready_for_pickup" || status === "released"
          ? CheckCircle2
          : Info;
  const label =
    audience === "staff" ? COE_STATUS_LABELS[status] : COE_REQUESTOR_STATUS_LABELS[status];

  return (
    <div role="status" className={`flex min-w-0 gap-3 rounded-sm border p-3 ${tone}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconTone}`} aria-hidden />
      <div className="min-w-0 space-y-0.5 break-words text-sm">
        <p className="font-semibold">{label}</p>
        <p>{audience === "staff" ? staffHint(status) : COE_STATUS_HINTS[status]}</p>
        {status === "correction_requested" && correctionMessage && (
          <p className="whitespace-pre-line pt-1 text-sm">{correctionMessage}</p>
        )}
        {status === "rejected" && audience === "requestor" && (
          <p className="text-xs">
            {remarks
              ? "See the HRDO remarks below, then submit a new request."
              : "No remarks were recorded. Contact HRDO for details, then submit a new request."}
          </p>
        )}
        {status === "pending" && audience === "requestor" && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" aria-hidden /> HRDO will update this request. Check this
            page for the latest status.
          </p>
        )}
      </div>
    </div>
  );
}

function DocumentPanel({
  request,
  isStaff,
  canDownload,
  downloading,
  onDownload,
}: {
  request: CoeRequest;
  isStaff: boolean;
  canDownload: boolean;
  downloading: boolean;
  onDownload: () => void;
}) {
  const expectsDocument = coeNeedsDocument(request.copyType);
  return (
    <Section title="Signed COE">
      {request.hasDocument ? (
        <div className="space-y-2 text-sm">
          <p className="flex items-start gap-2">
            <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            <span className="min-w-0 break-words">
              {request.documentFileName || "Signed COE document"}
            </span>
          </p>
          {canDownload ? (
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              disabled={downloading}
              onClick={onDownload}
            >
              {downloading ? (
                <ButtonLoading label="Preparing download…" />
              ) : (
                <>
                  <Download className="h-4 w-4" aria-hidden /> Download signed COE
                </>
              )}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              The signed COE becomes available once HRDO releases it.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {expectsDocument
            ? isStaff
              ? "No signed COE document has been uploaded yet. Upload it while processing the request."
              : "HRDO will upload the signed COE here once it is finalized."
            : "This request is for an original printed copy, so no document is uploaded."}
        </p>
      )}
    </Section>
  );
}

function CorrectionForm({ request }: { request: CoeRequest }) {
  const queryClient = useQueryClient();
  const [purpose, setPurpose] = useState(() => normalizePurposeChoice(request.purpose));
  const [customPurpose, setCustomPurpose] = useState(() =>
    normalizePurposeChoice(request.purpose) === OTHER_PURPOSE_OPTION ? request.purpose : "",
  );
  const [note, setNote] = useState(request.note);
  const [employeeEmail, setEmployeeEmail] = useState(request.employeeEmail);
  const [employeeNumber, setEmployeeNumber] = useState(request.employeeNumber);
  const [copyType, setCopyType] = useState<CoeCopyType>(request.copyType);

  const selectedPurpose = purpose === OTHER_PURPOSE_OPTION ? customPurpose : purpose;

  const resubmit = useMutation({
    mutationFn: async () =>
      unwrap(
        resubmitCoeRequestFn({
          data: {
            id: request.id,
            purpose: selectedPurpose.trim(),
            note,
            employeeEmail: employeeEmail.trim(),
            employeeNumber: employeeNumber.trim(),
            copyType,
          },
        }),
      ),
    onSuccess: async () => {
      toast.success("Corrected details submitted. HRDO will review them again.");
      await queryClient.invalidateQueries({ queryKey: ["coe"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "We couldn't submit your corrections.");
    },
  });

  return (
    <Section title="Submit correction">
      <form
        className="space-y-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const trimmedPurpose = selectedPurpose.trim();
          const trimmedEmployeeEmail = employeeEmail.trim();
          const trimmedEmployeeNumber = employeeNumber.trim();
          if (!trimmedEmployeeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmployeeEmail)) {
            toast.error("Enter a valid email address.");
            return;
          }
          if (trimmedPurpose.length < 5) {
            toast.error("Choose or enter a valid purpose for the request.");
            return;
          }
          if (trimmedEmployeeNumber && trimmedEmployeeNumber.length < 3) {
            toast.error("Employee ID must be 3 or more characters if provided.");
            return;
          }
          resubmit.mutate();
        }}
      >
        <div>
          <Label htmlFor="resubmit-employee-email">Email address</Label>
          <Input
            id="resubmit-employee-email"
            className="mt-1"
            type="email"
            value={employeeEmail}
            onChange={(event) => setEmployeeEmail(event.target.value)}
            placeholder="name@lyceumalabang.edu.ph"
          />
        </div>
        <div>
          <Label htmlFor="resubmit-employee-number">Employee ID (optional)</Label>
          <Input
            id="resubmit-employee-number"
            className="mt-1"
            value={employeeNumber}
            onChange={(event) => setEmployeeNumber(event.target.value)}
            maxLength={40}
          />
        </div>
        <div>
          <Label htmlFor="resubmit-purpose">Purpose of request</Label>
          <Select value={purpose} onValueChange={(value) => setPurpose(value)}>
            <SelectTrigger id="resubmit-purpose" className="mt-1">
              <SelectValue placeholder="Choose a purpose" />
            </SelectTrigger>
            <SelectContent>
              {COE_PURPOSE_OPTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {purpose === OTHER_PURPOSE_OPTION && (
            <div className="mt-3">
              <Label htmlFor="resubmit-custom-purpose">Other (Please Specify)</Label>
              <Input
                id="resubmit-custom-purpose"
                className="mt-1"
                value={customPurpose}
                onChange={(event) => setCustomPurpose(event.target.value)}
                placeholder="Please specify the purpose"
                maxLength={255}
              />
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="resubmit-copy-type">Type of copy</Label>
          <Select value={copyType} onValueChange={(value) => setCopyType(value as CoeCopyType)}>
            <SelectTrigger id="resubmit-copy-type" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COE_COPY_TYPES.map((key) => (
                <SelectItem key={key} value={key}>
                  {COE_COPY_TYPE_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="resubmit-note">Additional note (optional)</Label>
          <Textarea
            id="resubmit-note"
            className="mt-1 min-h-24"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Your original submission date and deadline do not change when you submit corrections.
        </p>
        <Button type="submit" className="w-full" disabled={resubmit.isPending}>
          {resubmit.isPending ? (
            <ButtonLoading label="Submitting…" />
          ) : (
            <>
              <Upload className="h-4 w-4" aria-hidden /> Submit corrected details
            </>
          )}
        </Button>
      </form>
    </Section>
  );
}
