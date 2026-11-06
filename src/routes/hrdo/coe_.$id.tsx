import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
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
import { EmptyState, PageHeader, Section } from "@/components/app/PageHeader";
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

type ActionPayload =
  | { kind: "verify" }
  | { kind: "process" }
  | { kind: "correction"; message: string }
  | { kind: "reject"; remarks: string }
  | { kind: "upload"; file: File }
  | { kind: "ready" }
  | { kind: "release"; receivedByName: string };

const ACTION_SUCCESS: Record<ActionPayload["kind"], string> = {
  verify: "Employee information verified.",
  process: "COE preparation started.",
  correction: "The employee has been asked to correct the request.",
  upload: "Signed COE uploaded.",
  ready: "Request marked ready for pickup.",
  release: "Document release recorded.",
  reject: "Request rejected.",
};

/** The one action we show as the big primary button, in the order work normally happens. */
const PRIMARY_ORDER: CoeAction[] = [
  "verify",
  "process",
  "upload_document",
  "mark_ready",
  "release",
];

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

function normalizePurposeChoice(value: string) {
  return COE_PURPOSE_OPTIONS.includes(value as (typeof COE_PURPOSE_OPTIONS)[number])
    ? value
    : OTHER_PURPOSE_OPTION;
}

/** Splits the stored note into what the employee typed and the system-generated detail line(s). */
function splitRequestNote(note: string) {
  const lines = note.split("\n");
  const index = lines.findIndex((line) => /(?:^|\| )Requestor type:/.test(line));
  if (index === -1) return { customNote: note, metadata: "" };
  return {
    customNote: lines.slice(0, index).join("\n"),
    metadata: lines.slice(index).join("\n"),
  };
}

function parseRequestMetadata(metadata: string) {
  return metadata
    ? metadata.split(/\s*\|\s*/).flatMap((part) => {
        const separator = part.indexOf(": ");
        return separator === -1
          ? []
          : [[part.slice(0, separator), part.slice(separator + 2)] as const];
      })
    : [];
}

function formatRequestNote(note: string) {
  const { customNote, metadata } = splitRequestNote(note);
  return { customNote, fields: parseRequestMetadata(metadata) };
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

function todayISO() {
  // en-CA gives YYYY-MM-DD in the viewer's local time zone (not UTC).
  return new Date().toLocaleDateString("en-CA");
}

function safeWords(amount: string) {
  try {
    return amount.trim() ? compensationAmountToWords(amount) : "";
  } catch {
    return "";
  }
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

type TemplateKey =
  | "employeeName"
  | "dateHired"
  | "employmentEndDate"
  | "position"
  | "department"
  | "compensationAmount"
  | "purpose"
  | "issueDate"
  | "preparedByName";

const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  employeeName: "Employee name",
  dateHired: "Date hired",
  employmentEndDate: "Last day of employment",
  position: "Position / designation",
  department: "Department / office",
  compensationAmount: "Compensation amount",
  purpose: "Purpose",
  issueDate: "Issue date",
  preparedByName: "Prepared by",
};

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

/* -------------------------------------------------------------------------- */
/* Layout pieces (shadcn-style cards)                                          */
/* -------------------------------------------------------------------------- */

function Metabox({
  title,
  children,
  footer,
  bodyClassName = "p-4",
}: {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="min-w-0 rounded-xl border bg-card text-card-foreground shadow-sm">
      <h2 className="border-b px-4 py-3 text-sm font-semibold tracking-tight">{title}</h2>
      <div className={bodyClassName}>{children}</div>
      {footer && (
        <div className="flex items-center justify-between gap-3 rounded-b-xl border-t bg-muted/50 px-4 py-3">
          {footer}
        </div>
      )}
    </section>
  );
}

/** A label-left / value-right row. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 whitespace-pre-line break-words text-sm font-medium">{children}</dd>
    </div>
  );
}

function RowGroup({ title }: { title: string }) {
  return (
    <div className="border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
      {title}
    </div>
  );
}

function MetaLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress tracker                                                            */
/* -------------------------------------------------------------------------- */

const TRACK_STEPS = ["Submitted", "Verified", "Preparing COE", "Ready", "Released"] as const;

/** Index of the step currently being worked on. Steps before it are done. */
function trackIndex(status: CoeStatus) {
  switch (status) {
    case "pending":
    case "under_review":
    case "correction_requested":
      return 1;
    case "processing":
    case "awaiting_review":
      return 2;
    case "ready_for_pickup":
      return 3;
    case "released":
      return TRACK_STEPS.length;
    default:
      return 1;
  }
}

function ProgressTracker({ status }: { status: CoeStatus }) {
  const current = trackIndex(status);
  const needsAttention = status === "correction_requested";
  return (
    <div className="rounded-xl border bg-card px-2 py-5 shadow-sm sm:px-4">
      <ol className="flex items-start" aria-label="Request progress">
        {TRACK_STEPS.map((label, i) => {
          const done = i < current;
          const isCurrent = i === current;
          const circle = done
            ? "border-primary bg-primary text-primary-foreground"
            : isCurrent
              ? needsAttention
                ? "border-warning bg-card text-warning"
                : "border-primary bg-card text-primary ring-4 ring-primary/15"
              : "border-border bg-card text-muted-foreground";
          return (
            <li
              key={label}
              className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
              aria-current={isCurrent ? "step" : undefined}
            >
              <div className="flex w-full items-center">
                <span
                  className={`h-0.5 flex-1 ${i === 0 ? "bg-transparent" : i <= current ? "bg-primary" : "bg-border"}`}
                />
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold ${circle}`}
                >
                  {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                </span>
                <span
                  className={`h-0.5 flex-1 ${i === TRACK_STEPS.length - 1 ? "bg-transparent" : i < current ? "bg-primary" : "bg-border"}`}
                />
              </div>
              <span
                className={`px-0.5 text-xs leading-tight ${isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              >
                {label}
                {done && <span className="sr-only"> (done)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

function CoeDetailPage() {
  const { id } = Route.useParams();
  const { hrdoViewer } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const isStaff = hrdoViewer?.role === "hrdo_staff" || hrdoViewer?.role === "hrdo_admin";

  const [active, setActive] = useState<CoeAction | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [correction, setCorrection] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<CoeTemplatePreview | null>(null);
  const [sentTo, setSentTo] = useState("");
  // Only holds what staff typed. Anything not edited falls back to the request's own value.
  const [templateFields, setTemplateFields] = useState<Partial<Record<TemplateKey, string>>>({
    issueDate: todayISO(),
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
        case "upload": {
          const data = new FormData();
          data.set("id", id);
          data.set("file", payload.file, payload.file.name);
          return unwrap(uploadCoeDocumentFn({ data }));
        }
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
      setActive(null);
      if (payload.kind === "process") setTemplateOpen(true);
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

  const audience = isStaff ? "staff" : "requestor";
  const actions: CoeAction[] = isStaff ? coeStaffActions(request) : [];
  const canDownload = coeCanDownloadDocument(request, audience);
  const formattedNote = formatRequestNote(request.note);
  const isThirdPartyVerifier = /(?:^|\| )Requestor type: Third-Party Verifier/i.test(request.note);
  const includesCompensation = coeRequestsCompensation(request.note);
  const viewerName = hrdoViewer.name;
  const isOriginalCopy = request.copyType === "original";

  /* ---- action layout: one main button, a few secondary ones, reject as a link ---- */
  const primaryKey = PRIMARY_ORDER.find((key) => actions.includes(key)) ?? null;
  const secondaryKeys = actions.filter((key) => key !== primaryKey && key !== "reject");
  const canReject = actions.includes("reject");
  const templateIsLead = request.status === "processing" && !request.hasDocument;

  const toggleAction = (key: CoeAction) => {
    setActive((current) => (current === key ? null : key));
    setCorrection("");
    setReceivedBy("");
    setFile(null);
  };

  const submitAction = (key: CoeAction) => {
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
      action.mutate({ kind: "release", receivedByName: receivedBy.trim() });
    } else if (key === "upload_document") {
      if (!file) {
        toast.error("Choose the signed COE document first.");
        return;
      }
      action.mutate({ kind: "upload", file });
    }
  };

  const pickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
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
    setFile(selected);
  };

  /* ---- COE template ---- */
  const templateDefaults: Record<TemplateKey, string> = {
    employeeName: request.employeeName,
    dateHired: requestEmploymentDate(request.note, "Date hired"),
    employmentEndDate: requestEmploymentDate(request.note, "Employment end date"),
    position: "",
    department: isThirdPartyVerifier
      ? ""
      : requestNoteValue(request.note, "Department") || request.department,
    compensationAmount: "",
    purpose: request.purpose,
    issueDate: todayISO(),
    preparedByName: viewerName,
  };
  const fieldValue = (key: TemplateKey) => templateFields[key] ?? templateDefaults[key];
  const setField = (key: TemplateKey, value: string) => {
    setTemplateFields((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setSentTo("");
  };

  const requiredKeys: TemplateKey[] = [
    "employeeName",
    "position",
    "purpose",
    "issueDate",
    ...(isThirdPartyVerifier ? (["employmentEndDate"] as TemplateKey[]) : []),
    ...(includesCompensation ? (["compensationAmount"] as TemplateKey[]) : []),
  ];
  const missingLabels = requiredKeys
    .filter((key) => !fieldValue(key).trim())
    .map((key) => TEMPLATE_LABELS[key]);
  const canGenerate = request.status === "processing" && !generating && missingLabels.length === 0;

  const templatePayload = (): CoeTemplatePayload => {
    const v = (key: TemplateKey) => fieldValue(key).trim();
    return {
      id,
      employeeName: v("employeeName"),
      dateHired: v("dateHired"),
      employmentEndDate: v("employmentEndDate"),
      position: v("position"),
      department: v("department"),
      compensationWords: compensationAmountToWords(v("compensationAmount")),
      compensationAmount: v("compensationAmount"),
      purpose: v("purpose"),
      issueDate: v("issueDate"),
      preparedByName: v("preparedByName"),
      includeCompensation: includesCompensation,
    };
  };

  const generateTemplate = async () => {
    setGenerating(true);
    try {
      const payload = templatePayload();
      const result = await unwrap(generateCoeTemplateFn({ data: payload }));
      setPreview({ payload, ...result });
      setSentTo("");
      toast.success("Word file ready. Download it to review.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "We couldn't generate the COE template.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const downloadPreview = () => {
    if (!preview) return;
    saveBase64File(preview.fileName, preview.mime, preview.base64);
  };

  const sendTemplate = async () => {
    if (!preview) return;
    setSending(true);
    try {
      const result = await unwrap(sendCoeTemplateFn({ data: preview.payload }));
      setPreview(null);
      setSentTo(result.recipientEmail);
      setTemplateOpen(false);
      toast.success(`Word template sent to ${result.recipientEmail}.`);
      await queryClient.invalidateQueries({ queryKey: ["coe"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't send the COE template.");
    } finally {
      setSending(false);
    }
  };

  const downloadDocument = async () => {
    setDownloading(true);
    try {
      const document = await unwrap(getCoeDocumentFn({ data: { id } }));
      saveBase64File(document.fileName, document.mime, document.base64);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't download the signed COE.");
    } finally {
      setDownloading(false);
    }
  };

  /* ---- inline form shown under the action buttons ---- */
  const renderActionPanel = (key: CoeAction) => {
    const destructive = key === "reject";
    return (
      <div
        className={`mt-3 space-y-2 rounded-lg border p-3 ${destructive ? "border-destructive/40 bg-danger-soft" : "bg-muted/30"}`}
      >
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
            <p className="text-xs text-muted-foreground">
              The employee will have to submit a new request.
            </p>
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
            <Label htmlFor="coe-document">Signed COE (PDF or Word .docx, max 5 MB)</Label>
            <Input
              id="coe-document"
              type="file"
              accept={`.pdf,.docx,${COE_DOCUMENT_MIMES.pdf},${COE_DOCUMENT_MIMES.docx}`}
              onChange={pickFile}
            />
            {file && (
              <p className="break-words text-xs text-muted-foreground">{file.name} selected.</p>
            )}
            <p className="text-xs text-muted-foreground">{COE_COPY_TYPE_HINTS[request.copyType]}</p>
          </>
        )}
        {(key === "verify" || key === "process" || key === "mark_ready") && (
          <p className="text-xs text-muted-foreground">
            {key === "verify"
              ? "Check the name, Employee ID, department and employment details against HR records first."
              : key === "process"
                ? request.status === "awaiting_review"
                  ? "Use this after the requestor has reviewed the filled Word template."
                  : "After this, fill in the COE template, get it signed, then upload the signed document."
                : "The printed, signed COE is now waiting at the HRDO desk."}
          </p>
        )}
        <Button
          type="button"
          variant={destructive ? "destructive" : "default"}
          className="w-full"
          disabled={action.isPending}
          onClick={() => submitAction(key)}
        >
          {action.isPending ? <ButtonLoading label="Saving…" /> : actionLabel(key, request.status)}
        </Button>
      </div>
    );
  };

  const rejectedRemarksShownInBanner = request.status === "rejected";

  return (
    <div className="space-y-4">
      <PageHeader
        title={`COE Request ${coeReference(request.id)}`}
        description={`${request.employeeName} · Submitted ${fmtDateTime(request.requestedAt)}`}
        actions={
          <Button asChild variant="outline">
            <Link to={isStaff ? "/hrdo/requests" : "/hrdo/coe"}>
              {isStaff ? "Back to COE Requests" : "New COE Request"}
            </Link>
          </Button>
        }
      />

      {request.status !== "rejected" && <ProgressTracker status={request.status} />}

      <StatusBanner request={request} audience={audience} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Sidebar comes first on phones so status and actions are not buried. */}
        <div className="order-first min-w-0 space-y-4 lg:order-last">
          <Metabox title="Status" bodyClassName="space-y-3 p-4">
            <CoeStatusBadge status={request.status} audience={audience} />
            <p className="text-sm text-muted-foreground">
              {isStaff ? staffHint(request.status) : COE_STATUS_HINTS[request.status]}
            </p>
            <dl className="divide-y border-t pt-1 text-sm">
              <MetaLine label="Deadline">
                {fmtDateTime(request.deadlineAt)}
                <span className="mt-0.5 block font-normal">
                  <CoeDeadlineNote deadlineAt={request.deadlineAt} status={request.status} />
                </span>
              </MetaLine>
              <MetaLine label="Last updated">{fmtDateTime(request.updatedAt)}</MetaLine>
              <MetaLine label="Handled by">
                {request.processedByName || "Not yet assigned"}
              </MetaLine>
              {request.verifiedAt && (
                <MetaLine label="Verified">
                  {fmtDateTime(request.verifiedAt)}
                  {request.verifiedByName ? ` · ${request.verifiedByName}` : ""}
                </MetaLine>
              )}
              {request.correctionRequestedAt && (
                <MetaLine label="Correction asked">
                  {fmtDateTime(request.correctionRequestedAt)}
                </MetaLine>
              )}
              {request.finalizedAt && (
                <MetaLine label="COE finalized">{fmtDateTime(request.finalizedAt)}</MetaLine>
              )}
              {request.readyAt && (
                <MetaLine label="Ready for pickup">{fmtDateTime(request.readyAt)}</MetaLine>
              )}
              {request.releasedAt && (
                <MetaLine label="Released">
                  {fmtDateTime(request.releasedAt)}
                  {request.releasedByName ? ` · ${request.releasedByName}` : ""}
                </MetaLine>
              )}
              {request.receivedByName && (
                <MetaLine label="Received by">{request.receivedByName}</MetaLine>
              )}
            </dl>
          </Metabox>

          {!isStaff && request.status === "correction_requested" && (
            <CorrectionForm request={request} />
          )}

          {isStaff && (
            <Metabox
              title="HRDO actions"
              footer={
                canReject ? (
                  <button
                    type="button"
                    className="rounded-sm text-sm text-destructive underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-expanded={active === "reject"}
                    onClick={() => toggleAction("reject")}
                  >
                    Reject request
                  </button>
                ) : undefined
              }
            >
              {request.status === "processing" && (
                <Button
                  type="button"
                  variant={templateIsLead ? "default" : "outline"}
                  className="mb-2 w-full justify-start"
                  onClick={() => setTemplateOpen(true)}
                >
                  <FileCheck2 className="h-4 w-4" aria-hidden />
                  Fill in COE template
                </Button>
              )}

              {actions.length === 0 && request.status !== "processing" ? (
                <p className="text-sm text-muted-foreground">
                  No action is available while this request is{" "}
                  {COE_STATUS_LABELS[request.status].toLowerCase()}.
                </p>
              ) : (
                <div className="space-y-2">
                  {primaryKey && (
                    <Button
                      type="button"
                      variant={templateIsLead ? "outline" : "default"}
                      className="w-full justify-start"
                      aria-expanded={active === primaryKey}
                      onClick={() => toggleAction(primaryKey)}
                    >
                      {actionLabel(primaryKey, request.status)}
                    </Button>
                  )}
                  {secondaryKeys.map((key) => (
                    <Button
                      key={key}
                      type="button"
                      variant="outline"
                      className="w-full justify-start"
                      aria-expanded={active === key}
                      onClick={() => toggleAction(key)}
                    >
                      {actionLabel(key, request.status)}
                    </Button>
                  ))}
                </div>
              )}

              {active && actions.includes(active) && renderActionPanel(active)}
            </Metabox>
          )}

          <DocumentPanel
            request={request}
            isStaff={Boolean(isStaff)}
            canDownload={canDownload}
            downloading={downloading}
            onDownload={() => void downloadDocument()}
          />
        </div>

        <div className="order-last min-w-0 space-y-4 lg:order-first">
          <Metabox title="Request details" bodyClassName="p-0">
            {!isStaff && request.status === "correction_requested" && (
              <p className="border-b px-4 py-3 text-sm text-muted-foreground">
                These are the details you originally sent. Use the form above to change them.
              </p>
            )}
            <dl>
              <RowGroup title="Requestor" />
              <Row label="Name">{request.employeeName}</Row>
              <Row label="Employee ID">{request.employeeNumber || "—"}</Row>
              <Row label="Email address">{request.employeeEmail}</Row>
              <Row label="Department / office">{request.department || "—"}</Row>

              <RowGroup title="Request" />
              <Row label="Purpose">{request.purpose}</Row>
              <Row label="Type of copy">{COE_COPY_TYPE_LABELS[request.copyType]}</Row>
              <Row label="Date requested">{fmtDateTime(request.requestedAt)}</Row>
              <Row label="Request ID">
                <span className="font-mono text-[13px]">{request.id}</span>
              </Row>

              {formattedNote.fields.length > 0 && (
                <>
                  <RowGroup title="Employment details" />
                  {formattedNote.fields.map(([label, value]) => (
                    <Row key={label} label={label}>
                      {value}
                    </Row>
                  ))}
                </>
              )}

              <RowGroup title="Notes" />
              <Row label="Additional note">
                {formattedNote.customNote || (
                  <span className="font-normal text-muted-foreground">
                    No additional note was provided.
                  </span>
                )}
              </Row>
              {request.remarks && !rejectedRemarksShownInBanner && (
                <Row label="HRDO remarks">{request.remarks}</Row>
              )}
            </dl>
          </Metabox>

          <Metabox title="History">
            <CoeHistoryList
              entries={request.history}
              empty="No history has been recorded for this request yet."
            />
          </Metabox>
        </div>
      </div>

      {isStaff && (
        <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Fill in COE template</DialogTitle>
              <DialogDescription>
                {isOriginalCopy
                  ? "This is a hardcopy-only request. Generate the Word file for printing. It will not be emailed."
                  : "Fill in the details, generate the Word file, then email it to the requestor. If something is wrong, fix the fields and generate it again."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              {request.status !== "processing" && (
                <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span>Processing has not started yet.</span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={action.isPending}
                    onClick={() => action.mutate({ kind: "process" })}
                  >
                    {action.isPending ? "Please wait…" : actionLabel("process", request.status)}
                  </Button>
                </div>
              )}

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Employee</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TemplateField
                    id="employeeName"
                    label={TEMPLATE_LABELS.employeeName}
                    value={fieldValue("employeeName")}
                    onChange={(v) => setField("employeeName", v)}
                    required
                  />
                  <TemplateField
                    id="position"
                    label={TEMPLATE_LABELS.position}
                    value={fieldValue("position")}
                    onChange={(v) => setField("position", v)}
                    required
                  />
                  <TemplateField
                    id="department"
                    label={TEMPLATE_LABELS.department}
                    value={fieldValue("department")}
                    placeholder={
                      isThirdPartyVerifier
                        ? "Enter the former employee's department / office"
                        : undefined
                    }
                    onChange={(v) => setField("department", v)}
                  />
                  <TemplateField
                    id="dateHired"
                    label={TEMPLATE_LABELS.dateHired}
                    type="date"
                    value={fieldValue("dateHired")}
                    onChange={(v) => setField("dateHired", v)}
                  />
                  {isThirdPartyVerifier && (
                    <TemplateField
                      id="employmentEndDate"
                      label={TEMPLATE_LABELS.employmentEndDate}
                      type="date"
                      value={fieldValue("employmentEndDate")}
                      onChange={(v) => setField("employmentEndDate", v)}
                      required
                    />
                  )}
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Certificate</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {includesCompensation && (
                    <TemplateField
                      id="compensationAmount"
                      label={TEMPLATE_LABELS.compensationAmount}
                      value={fieldValue("compensationAmount")}
                      onChange={(v) => setField("compensationAmount", v)}
                      hint={
                        safeWords(fieldValue("compensationAmount")) ||
                        "The amount in words appears here."
                      }
                      required
                    />
                  )}
                  <TemplateField
                    id="purpose"
                    label={TEMPLATE_LABELS.purpose}
                    value={fieldValue("purpose")}
                    onChange={(v) => setField("purpose", v)}
                    required
                  />
                  <TemplateField
                    id="issueDate"
                    label={TEMPLATE_LABELS.issueDate}
                    type="date"
                    value={fieldValue("issueDate")}
                    onChange={(v) => setField("issueDate", v)}
                    required
                  />
                  <TemplateField
                    id="preparedByName"
                    label={TEMPLATE_LABELS.preparedByName}
                    value={fieldValue("preparedByName")}
                    onChange={(v) => setField("preparedByName", v)}
                  />
                </div>
              </fieldset>

              <div className="divide-y rounded-lg border">
                <div className="space-y-2 p-3">
                  <p className="text-sm font-semibold">1. Generate the Word file</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!canGenerate}
                      onClick={() => void generateTemplate()}
                    >
                      <FileDown className="h-4 w-4" aria-hidden />
                      {generating
                        ? "Generating…"
                        : preview
                          ? "Generate again"
                          : "Generate Word file"}
                    </Button>
                    {preview && (
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <FileCheck2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                        <span className="min-w-0 break-words font-medium">{preview.fileName}</span>
                        <Button type="button" size="sm" variant="outline" onClick={downloadPreview}>
                          <Download className="h-4 w-4" aria-hidden /> Download
                        </Button>
                      </span>
                    )}
                  </div>
                  {request.status !== "processing" ? (
                    <p className="text-xs text-muted-foreground">Start processing first.</p>
                  ) : missingLabels.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Still needed: {missingLabels.join(", ")}.
                    </p>
                  ) : null}
                </div>

                {isOriginalCopy ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    When the printed copy is ready, close this window and choose{" "}
                    <span className="font-medium text-foreground">Mark ready for pickup</span>. The
                    requestor will get a pickup notice.
                  </div>
                ) : (
                  <div className="space-y-2 p-3">
                    <p className="text-sm font-semibold">2. Email it to the requestor</p>
                    <Button
                      type="button"
                      disabled={
                        request.status !== "processing" || !preview || sending || generating
                      }
                      onClick={() => void sendTemplate()}
                    >
                      <Send className="h-4 w-4" aria-hidden />
                      {sending ? "Sending…" : "Send Word file to requestor"}
                    </Button>
                    <p className="text-xs text-muted-foreground" role="status">
                      {sentTo
                        ? `Sent to ${sentTo}. Generate a new copy before sending again.`
                        : preview
                          ? "Nothing is emailed until you press Send."
                          : "Generate the file first."}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <a
                  href="/COE%20FORMAT.docx"
                  download="COE FORMAT.docx"
                  className="text-sm text-primary underline underline-offset-2"
                >
                  Download blank COE template
                </a>
                <Button type="button" variant="outline" onClick={() => setTemplateOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

function TemplateField({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date";
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={`template-${id}`}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Input
        id={`template-${id}`}
        className="mt-1"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && <p className="mt-1 break-words text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Banner({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: "danger" | "warning" | "success";
  icon: typeof Info;
  title: string;
  children?: ReactNode;
}) {
  const box = {
    danger: "border-destructive/30 border-l-destructive bg-danger-soft",
    warning: "border-warning/30 border-l-warning bg-warning-soft",
    success: "border-success/30 border-l-success bg-success-soft",
  }[tone];
  const iconColor = {
    danger: "text-destructive",
    warning: "text-warning",
    success: "text-success",
  }[tone];
  return (
    <div className={`flex min-w-0 gap-3 rounded-lg border border-l-4 p-4 ${box}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} aria-hidden />
      <div className="min-w-0 space-y-1 break-words text-sm">
        <p className="font-semibold">{title}</p>
        {children}
      </div>
    </div>
  );
}

/** Only shown when the person needs to notice something. Routine status lives in the Status box. */
function StatusBanner({
  request,
  audience,
}: {
  request: CoeRequest;
  audience: "staff" | "requestor";
}) {
  const { status } = request;
  const label =
    audience === "staff" ? COE_STATUS_LABELS[status] : COE_REQUESTOR_STATUS_LABELS[status];

  if (status === "rejected") {
    return (
      <Banner tone="danger" icon={XCircle} title={label}>
        <p className="whitespace-pre-line">
          {request.remarks ||
            (audience === "requestor"
              ? "No remarks were recorded. Contact HRDO for details."
              : "No remarks were recorded.")}
        </p>
        {audience === "requestor" && (
          <p className="text-muted-foreground">Submit a new request if you still need a COE.</p>
        )}
      </Banner>
    );
  }

  if (status === "correction_requested") {
    return audience === "requestor" ? (
      <Banner tone="warning" icon={Info} title="HRDO needs a correction from you">
        <p className="whitespace-pre-line">
          {request.correctionMessage ||
            "Please contact HRDO for help with the correction needed on your request."}
        </p>
      </Banner>
    ) : (
      <Banner tone="warning" icon={Info} title="Waiting for the employee">
        {request.correctionMessage && (
          <p className="whitespace-pre-line">{request.correctionMessage}</p>
        )}
        <p className="text-muted-foreground">
          Correction requested on {fmtDateTime(request.correctionRequestedAt)}. The original
          submission date and deadline stay the same when the employee resubmits.
        </p>
      </Banner>
    );
  }

  if (status === "ready_for_pickup" && audience === "requestor") {
    return (
      <Banner tone="success" icon={CheckCircle2} title={label}>
        <p>{COE_STATUS_HINTS[status]}</p>
      </Banner>
    );
  }

  return null;
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
    <Metabox title="Signed COE">
      {request.hasDocument ? (
        <div className="space-y-3 text-sm">
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
              ? "No signed COE has been uploaded yet. Upload it while processing the request."
              : "HRDO will upload the signed COE here once it is finalized."
            : "This request is for an original printed copy, so no document is uploaded."}
        </p>
      )}
    </Metabox>
  );
}

function CorrectionForm({ request }: { request: CoeRequest }) {
  const queryClient = useQueryClient();
  const { customNote: originalNote, metadata } = splitRequestNote(request.note);
  const metadataFields = parseRequestMetadata(metadata);
  const metadataValues = Object.fromEntries(metadataFields);
  const isThirdParty = metadataValues["Requestor type"] === "Third-Party Verifier";
  const [purpose, setPurpose] = useState(() => normalizePurposeChoice(request.purpose));
  const [customPurpose, setCustomPurpose] = useState(() =>
    normalizePurposeChoice(request.purpose) === OTHER_PURPOSE_OPTION ? request.purpose : "",
  );
  const [note, setNote] = useState(originalNote);
  const [employeeEmail, setEmployeeEmail] = useState(request.employeeEmail);
  const [employeeNumber, setEmployeeNumber] = useState(request.employeeNumber);
  const [employeeName, setEmployeeName] = useState(request.employeeName);
  const [editedMetadata, setEditedMetadata] = useState<Record<string, string>>(metadataValues);
  const [copyType, setCopyType] = useState<CoeCopyType>(request.copyType);

  const selectedPurpose = purpose === OTHER_PURPOSE_OPTION ? customPurpose : purpose;
  const updatedMetadata = metadataFields
    .map(([label, originalValue]) => {
      const value = editedMetadata[label] ?? originalValue;
      if (label === "Date hired" && !value.trim()) return `${label}: Not provided`;
      if (label === "Employment end date" && !value.trim()) return `${label}: Present`;
      if (label === "Date needed" && !value.trim()) return `${label}: Not provided`;
      return `${label}: ${value.trim()}`;
    })
    .join(" | ");

  const resubmit = useMutation({
    mutationFn: async () =>
      unwrap(
        resubmitCoeRequestFn({
          data: {
            id: request.id,
            employeeName: employeeName.trim(),
            department: isThirdParty
              ? request.department
              : editedMetadata["Department"]?.trim() || request.department,
            purpose: selectedPurpose.trim(),
            note: [note.trim(), updatedMetadata].filter(Boolean).join("\n"),
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
    <form
      className="min-w-0 rounded-xl border bg-card text-card-foreground shadow-sm"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const trimmedPurpose = selectedPurpose.trim();
        const trimmedEmployeeEmail = employeeEmail.trim();
        const trimmedEmployeeNumber = employeeNumber.trim();
        const trimmedEmployeeName = employeeName.trim();
        if (trimmedEmployeeName.length < 5) {
          toast.error("Enter the employee's full name.");
          return;
        }
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
      <h2 className="border-b px-4 py-3 text-sm font-semibold tracking-tight">
        Update your request
      </h2>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          Please check HRDO&apos;s message, update the details below, then send the request back.
          The request type, original submission date, and deadline stay on record.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <Label htmlFor="resubmit-employee-name">
              {isThirdParty ? "Employee name to verify" : "Employee full name"}
            </Label>
            <Input
              id="resubmit-employee-name"
              className="mt-1 h-8 text-sm"
              value={employeeName}
              onChange={(event) => setEmployeeName(event.target.value)}
              maxLength={120}
            />
          </div>
          <div>
            <Label htmlFor="resubmit-employee-email">Your email address</Label>
            <Input
              id="resubmit-employee-email"
              className="mt-1 h-8 text-sm"
              type="email"
              value={employeeEmail}
              onChange={(event) => setEmployeeEmail(event.target.value)}
              placeholder="name@lyceumalabang.edu.ph"
            />
          </div>
          <div>
            <Label htmlFor="resubmit-employee-number">Employee ID (if you have one)</Label>
            <Input
              id="resubmit-employee-number"
              className="mt-1 h-8 text-sm"
              value={employeeNumber}
              onChange={(event) => setEmployeeNumber(event.target.value)}
              maxLength={40}
            />
          </div>
          <div>
            <Label htmlFor="resubmit-purpose">Why do you need the COE?</Label>
            <Select value={purpose} onValueChange={(value) => setPurpose(value)}>
              <SelectTrigger id="resubmit-purpose" className="mt-1 h-8 text-sm">
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
                  className="mt-1 h-8 text-sm"
                  value={customPurpose}
                  onChange={(event) => setCustomPurpose(event.target.value)}
                  placeholder="Please specify the purpose"
                  maxLength={255}
                />
              </div>
            )}
          </div>
          {metadataFields.map(([label, originalValue]) => {
            const value = editedMetadata[label] ?? originalValue;
            const readOnly = label === "Requestor type" || label === "Date requested";
            const isDate = ["Date needed", "Date hired", "Employment end date"].includes(label);
            const dateValue = isDate && ["Not provided", "Present"].includes(value) ? "" : value;
            const fieldId = `resubmit-detail-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            return (
              <div key={label}>
                <Label htmlFor={fieldId}>{label}</Label>
                {label === "Description" || (!readOnly && value.length > 100 && !isDate) ? (
                  <Textarea
                    id={fieldId}
                    className="mt-1 min-h-16 text-sm"
                    value={value}
                    disabled={readOnly}
                    onChange={(event) =>
                      setEditedMetadata((current) => ({
                        ...current,
                        [label]: event.target.value,
                      }))
                    }
                    maxLength={1000}
                  />
                ) : (
                  <Input
                    id={fieldId}
                    className="mt-1 h-8 text-sm"
                    type={isDate ? "date" : "text"}
                    value={dateValue}
                    disabled={readOnly}
                    onChange={(event) =>
                      setEditedMetadata((current) => ({
                        ...current,
                        [label]: event.target.value,
                      }))
                    }
                    maxLength={500}
                  />
                )}
                {readOnly && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    This information is kept as part of the original request record.
                  </p>
                )}
              </div>
            );
          })}
          <div>
            <Label htmlFor="resubmit-copy-type">How would you like to receive your COE?</Label>
            <Select value={copyType} onValueChange={(value) => setCopyType(value as CoeCopyType)}>
              <SelectTrigger id="resubmit-copy-type" className="mt-1 h-8 text-sm">
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
        </div>
        <div>
          <Label htmlFor="resubmit-note">Additional note (optional)</Label>
          <Textarea
            id="resubmit-note"
            className="mt-1 min-h-20 text-sm"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1500}
          />
        </div>
      </div>
      <div className="flex justify-end rounded-b-xl border-t bg-muted/50 px-4 py-3">
        <Button type="submit" disabled={resubmit.isPending}>
          {resubmit.isPending ? (
            <ButtonLoading label="Submitting…" />
          ) : (
            <>
              <Upload className="h-4 w-4" aria-hidden /> Send updated request to HRDO
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
