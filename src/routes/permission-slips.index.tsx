import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  FilePlus2,
  FileText,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SignaturePad, type SignatureValue } from "@/components/app/SignaturePad";
import { ButtonLoading, LoadingScreen } from "@/components/app/LoadingPanel";
import { ApiError, unwrap } from "@/lib/api";
import { canViewPermissionQueue, isPermissionHead } from "@/lib/permission-access";
import {
  listMyPermissionSlipsFn,
  listPendingPermissionSlipsFn,
  submitPermissionSlipFn,
} from "@/server-functions";

type PermissionSearch = {
  view?: "history" | "new" | undefined;
};

export const Route = createFileRoute("/permission-slips/")({
  validateSearch: (search: Record<string, unknown>): PermissionSearch => ({
    view: search["view"] === "history" ? "history" : search["view"] === "new" ? "new" : undefined,
  }),
  component: PermissionSlipsPage,
});

const PERMISSION_STEPS = [
  {
    key: "schedule",
    title: "Department & Schedule",
    blurb: "Enter your department or office, date, departure time, and return time.",
  },
  {
    key: "reason",
    title: "Reason",
    blurb: "State why you are leaving campus.",
  },
  {
    key: "signature",
    title: "Signature",
    blurb: "Add your electronic signature.",
  },
  {
    key: "review",
    title: "Review",
    blurb: "Review your details and submit for approval.",
  },
] as const;

function formatPhilippineDate(value: string) {
  if (!value) return "Not provided";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? (
    <p id={id} role="alert" className="mt-1.5 text-sm font-semibold text-destructive">
      {message}
    </p>
  ) : null;
}

type PermissionTab = "history" | "request" | "review";

function PermissionSlipTabs({
  hasQueueAccess,
  active,
}: {
  hasQueueAccess: boolean;
  active: PermissionTab;
}) {
  const base =
    "flex h-10 min-w-0 items-center justify-center gap-2 rounded-md px-2 text-sm font-semibold transition-colors sm:px-3";
  const activeClass = "bg-background text-foreground shadow-sm";
  const idleClass = "text-muted-foreground hover:text-foreground";

  return (
    <nav
      aria-label="Permission slip sections"
      className="rounded-lg border border-border bg-muted/60 p-1"
    >
      <div className={hasQueueAccess ? "grid grid-cols-3 gap-1" : "grid grid-cols-2 gap-1"}>
        <Link
          to="/permission-slips"
          search={{ view: "history" }}
          aria-current={active === "history" ? "page" : undefined}
          className={`${base} ${active === "history" ? activeClass : idleClass}`}
        >
          <FileText className="h-4 w-4 shrink-0" aria-hidden />
          <span className="hidden truncate sm:inline">My Permission Slips</span>
          <span className="truncate sm:hidden">My Slips</span>
        </Link>
        <Link
          to="/permission-slips"
          search={{ view: "new" }}
          aria-current={active === "request" ? "page" : undefined}
          className={`${base} ${active === "request" ? activeClass : idleClass}`}
        >
          <FilePlus2 className="h-4 w-4 shrink-0" aria-hidden />
          <span className="hidden truncate sm:inline">Request Permission Slip</span>
          <span className="truncate sm:hidden">Request</span>
        </Link>
        {hasQueueAccess && (
          <Link
            to="/permission-slips"
            search={{}}
            aria-current={active === "review" ? "page" : undefined}
            className={`${base} ${active === "review" ? activeClass : idleClass}`}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden truncate sm:inline">Permission Slip Review</span>
            <span className="truncate sm:hidden">Review</span>
          </Link>
        )}
      </div>
    </nav>
  );
}

function PermissionSlipsPage() {
  const search = Route.useSearch();
  const { permissionViewer } = Route.useRouteContext();
  const isHead = isPermissionHead(permissionViewer);
  const hasQueueAccess = canViewPermissionQueue(permissionViewer);
  const queryClient = useQueryClient();

  const isHistoryView = search.view === "history";
  const isExplicitNewView = search.view === "new";

  const employeeQuery = useQuery({
    queryKey: ["permission-slips", "mine"],
    queryFn: () => unwrap(listMyPermissionSlipsFn()),
    enabled: !hasQueueAccess || isHistoryView,
  });

  const pendingQuery = useQuery({
    queryKey: ["permission-slips", "pending"],
    queryFn: () => unwrap(listPendingPermissionSlipsFn()),
    enabled: hasQueueAccess && !isHistoryView && !isExplicitNewView,
  });

  // Multi-step form state
  const [currentStep, setCurrentStep] = useState(0);
  // New accounts start with a placeholder "General" department, so only prefill
  // when the profile holds a real department. Employees can always change it.
  const defaultDepartment = (() => {
    const department = permissionViewer?.department?.trim() ?? "";
    return department.toLowerCase() === "general" ? "" : department;
  })();
  const [department, setDepartment] = useState(defaultDepartment);
  const [requestedDate, setRequestedDate] = useState("");
  const [timeOut, setTimeOut] = useState("");
  const [timeIn, setTimeIn] = useState("");
  const [reason, setReason] = useState("");
  const [signature, setSignature] = useState<SignatureValue | null>(null);
  const [confirmedAgreement, setConfirmedAgreement] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<
      Record<
        "department" | "requestedDate" | "timeOut" | "timeIn" | "reason" | "signature" | "form",
        string
      >
    >
  >({});
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const currentStepConfig = PERMISSION_STEPS[currentStep] ?? PERMISSION_STEPS[0];
  const lastStepIndex = PERMISSION_STEPS.length - 1;

  function clearFieldError(field: keyof typeof fieldErrors) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function validateStep(step: number): boolean {
    const errors: typeof fieldErrors = {};

    if (step === 0) {
      if (department.trim().length < 2) {
        errors.department = "Enter your department or office.";
      }
      if (!requestedDate) errors.requestedDate = "Choose the date you will leave campus.";
      else if (requestedDate < today) errors.requestedDate = "Choose today or a future date.";

      if (!timeOut) errors.timeOut = "Enter the time you will leave campus.";
      if (!timeIn) errors.timeIn = "Enter the return time.";
      if (timeOut && timeIn && timeIn <= timeOut) {
        errors.timeIn = "Time In must be later than Time Out.";
      }
    } else if (step === 1) {
      if (reason.trim().length < 5) {
        errors.reason = "Explain your reason in at least 5 characters.";
      }
    } else if (step === 2) {
      if (!signature) {
        errors.signature = "Add your electronic signature before proceeding.";
      }
    } else if (step === 3) {
      if (!confirmedAgreement) {
        errors.form = "Please confirm the accuracy of your request details.";
      }
    }

    setFieldErrors(errors);
    const hasError = Object.keys(errors).length > 0;
    if (hasError) {
      const firstError = Object.values(errors)[0];
      if (firstError) toast.error(firstError);
      return false;
    }
    return true;
  }

  function handleNext() {
    if (validateStep(currentStep)) {
      if (currentStep < lastStepIndex) {
        setCurrentStep((s) => s + 1);
      }
    }
  }

  async function handleFinalSubmit() {
    if (!validateStep(0) || !validateStep(1) || !validateStep(2) || !validateStep(3)) {
      setShowConfirm(false);
      return;
    }
    if (!signature) {
      toast.error("Signature is required.");
      setShowConfirm(false);
      return;
    }

    setBusy(true);
    try {
      const result = await unwrap(
        submitPermissionSlipFn({
          data: {
            department: department.trim(),
            requestedDate,
            timeOut,
            timeIn,
            reason: reason.trim(),
            employeeSignature: signature.image,
          },
        }),
      );
      setSubmittedId(result.id);
      setEmailSent(result.emailDelivery.sent);
      setShowConfirm(false);
      toast.success("Permission Slip submitted successfully.");
      await queryClient.invalidateQueries({ queryKey: ["permission-slips", "mine"] });
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors) {
        setFieldErrors({
          ...(error.fieldErrors["department"]
            ? { department: error.fieldErrors["department"] }
            : {}),
          ...(error.fieldErrors["requestedDate"]
            ? { requestedDate: error.fieldErrors["requestedDate"] }
            : {}),
          ...(error.fieldErrors["timeOut"] ? { timeOut: error.fieldErrors["timeOut"] } : {}),
          ...(error.fieldErrors["timeIn"] ? { timeIn: error.fieldErrors["timeIn"] } : {}),
          ...(error.fieldErrors["reason"] ? { reason: error.fieldErrors["reason"] } : {}),
          ...(error.fieldErrors["employeeSignature"]
            ? { signature: error.fieldErrors["employeeSignature"] }
            : {}),
          ...(error.fieldErrors["form"] ? { form: error.fieldErrors["form"] } : {}),
        });
      }
      toast.error(error instanceof Error ? error.message : "Permission Slip submission failed.");
    } finally {
      setBusy(false);
    }
  }

  function submitAnotherRequest() {
    setSubmittedId(null);
    setEmailSent(null);
    setDepartment(defaultDepartment);
    setRequestedDate("");
    setTimeOut("");
    setTimeIn("");
    setReason("");
    setSignature(null);
    setConfirmedAgreement(false);
    setFieldErrors({});
    setCurrentStep(0);
  }

  // ── VIEW 1: DEDICATED "MY PERMISSION SLIPS" VIEW (?view=history) ────────────
  if (isHistoryView) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 py-4 sm:py-6">
        <PermissionSlipTabs hasQueueAccess={hasQueueAccess} active="history" />
        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Attendance</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
              My Permission Slips
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track the status of your submitted permission slips and view or download approved
              receipts.
            </p>
          </div>
          <Button asChild className="gap-2 shrink-0">
            <Link to="/permission-slips" search={{ view: "new" }}>
              <FilePlus2 className="h-4 w-4" />
              Request Permission Slip
            </Link>
          </Button>
        </div>

        {employeeQuery.isPending ? (
          <LoadingScreen label="Loading your permission slips" mode="inline" />
        ) : null}

        {employeeQuery.isError && (
          <Card role="alert" className="border-destructive/30">
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <p className="text-base font-semibold text-destructive">
                We couldn&apos;t load your Permission Slips.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {employeeQuery.error instanceof Error
                  ? employeeQuery.error.message
                  : "Please try again."}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                onClick={() => void employeeQuery.refetch()}
              >
                Try again
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {employeeQuery.data?.map((slip) => {
            const isApproved = slip.status === "approved";
            const isRejected = slip.status === "rejected";
            return (
              <Link
                key={slip.id}
                to="/permission-slips/$id"
                params={{ id: slip.id }}
                className="block"
              >
                <Card className="transition-all hover:border-primary hover:shadow-md">
                  <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-base font-bold text-foreground">
                          {formatPhilippineDate(slip.requestedDate)}
                        </span>
                        <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          {slip.timeOut} — {slip.timeIn}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-sm text-foreground/85">{slip.reason}</p>
                      <p className="text-xs text-muted-foreground">
                        Reference: {slip.id.slice(0, 8).toUpperCase()}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {isApproved ? (
                        <span className="inline-flex items-center gap-1.5 rounded-sm border border-success/30 bg-success-soft px-3 py-1 text-xs font-semibold text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                        </span>
                      ) : isRejected ? (
                        <span className="inline-flex items-center gap-1.5 rounded-sm border border-destructive/30 bg-danger-soft px-3 py-1 text-xs font-semibold text-destructive">
                          <XCircle className="h-3.5 w-3.5" /> Rejected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-sm border border-warning/30 bg-warning-soft px-3 py-1 text-xs font-semibold text-warning">
                          <Clock className="h-3.5 w-3.5" /> Pending Review
                        </span>
                      )}
                      <span className="inline-flex h-8 items-center justify-center gap-1 rounded-md px-3 text-xs font-medium text-primary transition-colors hover:bg-accent hover:text-accent-foreground">
                        View Details
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}

          {!employeeQuery.data?.length && !employeeQuery.isPending && !employeeQuery.isError && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/60 mb-3" />
                <p className="text-base font-semibold text-foreground">
                  No Permission Slip requests yet
                </p>
                <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                  You haven&apos;t submitted any permission slip requests yet. Click below to file
                  your first request.
                </p>
                <Button asChild className="mt-4 gap-2">
                  <Link to="/permission-slips" search={{ view: "new" }}>
                    <FilePlus2 className="h-4 w-4" />
                    Request Permission Slip
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // ── VIEW 2: HR DIRECTOR REVIEW QUEUE (when head visits without search) ──────
  if (hasQueueAccess && !isExplicitNewView) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 py-4 sm:py-6">
        <PermissionSlipTabs hasQueueAccess={hasQueueAccess} active="review" />
        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">HRDO</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
              {isHead ? "Permission Slip Review" : "Permission Slip Queue"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isHead
                ? "Review and electronically sign permission slips submitted by school personnel."
                : "View pending permission slips. Assigned signatories can approve or reject requests."}
            </p>
          </div>
          <Button asChild variant="outline" className="gap-2 shrink-0">
            <Link to="/permission-slips" search={{ view: "new" }}>
              <FilePlus2 className="h-4 w-4" />
              File Permission Slip
            </Link>
          </Button>
        </div>

        <div className="grid gap-4">
          {pendingQuery.isPending ? (
            <LoadingScreen label="Loading pending permission slips" mode="inline" />
          ) : null}

          {pendingQuery.data?.map((slip) => (
            <Link
              key={slip.id}
              to="/permission-slips/$id"
              params={{ id: slip.id }}
              className="block"
            >
              <Card className="transition-all hover:border-primary hover:shadow-md">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-foreground">{slip.employeeName}</p>
                    <p className="text-sm text-muted-foreground">
                      {slip.department} · {formatPhilippineDate(slip.requestedDate)} ({slip.timeOut}{" "}
                      — {slip.timeIn})
                    </p>
                    <p className="mt-2 line-clamp-1 text-sm text-foreground/90 font-medium">
                      {slip.reason}
                    </p>
                  </div>
                  <span className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
                    {isHead ? "Review" : "View"}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}

          {!pendingQuery.isPending && !pendingQuery.data?.length ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                No pending Permission Slips requiring review at this time.
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    );
  }

  // ── VIEW 3: SUCCESS SCREEN ──────────────────────────────────────────────────
  if (submittedId) {
    return (
      <div className="coe-request">
        <main className="coe-success-wrap">
          <section
            className="panel coe-success-card"
            role="status"
            aria-live="polite"
            aria-labelledby="permission-success-title"
          >
            <div className="coe-success-logos" aria-label="Lyceum of Alabang and HRDO">
              <img src="/loa-logo.png" alt="Lyceum of Alabang seal" width={72} height={72} />
              <img
                src="/HRDO%20LOGO.png"
                alt="Human Resources Development Office logo"
                width={72}
                height={72}
              />
            </div>
            <div className="coe-success-icon" aria-hidden="true">
              <Check />
            </div>
            <h1 id="permission-success-title">Permission Slip Submitted</h1>
            <p className="coe-success-lead">
              Your request was sent to the Human Resources Development Office (HRDO).
            </p>
            <p className="coe-success-message">
              The HRDO Director will review it. We’ll email{" "}
              <strong>{permissionViewer?.email}</strong> when it is approved or needs more
              information.
            </p>
            {emailSent === false && (
              <p role="status" className="coe-success-message text-amber-700">
                The request was saved, but the HRDO notification email was not sent. You can still
                track it below.
              </p>
            )}
            <p className="coe-success-reference">
              Reference ID: <strong>{submittedId}</strong>
            </p>
            <div className="coe-success-actions">
              <Button asChild>
                <Link to="/permission-slips/$id" params={{ id: submittedId }}>
                  View request status
                </Link>
              </Button>
              <Button type="button" variant="outline" onClick={submitAnotherRequest}>
                Submit another request
              </Button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // ── VIEW 4: SPACIOUS STEP-BY-STEP REQUEST FORM (NO AUTO-PLACED NAME/DEPT) ───
  return (
    <div className="coe-request coe-permission">
      {busy && <LoadingScreen label="Submitting Permission Slip" mode="overlay" immediate />}

      <div className="coe-main">
        <div className="mb-4">
          <PermissionSlipTabs hasQueueAccess={hasQueueAccess} active="request" />
        </div>
        {/* Intro header with seal & title */}
        <div className="coe-form-intro">
          <div className="coe-form-logos" aria-label="Lyceum of Alabang and HRDO">
            <img src="/loa-logo.png" alt="Lyceum of Alabang seal" />
            <img src="/HRDO%20LOGO.png" alt="HRDO logo" />
          </div>
          <h1>Permission Slip Request</h1>
          <p>{currentStepConfig.blurb}</p>
        </div>

        {/* 4-Step Progress Indicator (Spacious & Prominent) */}
        <ol
          className="coe-steps"
          aria-label="Request progress"
          style={{ gridTemplateColumns: `repeat(${PERMISSION_STEPS.length}, minmax(0, 1fr))` }}
        >
          {PERMISSION_STEPS.map((step, index) => {
            const state =
              index < currentStep ? "done" : index === currentStep ? "active" : "upcoming";
            return (
              <li key={step.key} className="coe-step" data-state={state}>
                <div className="coe-step-content">
                  <span className="coe-step-circle">
                    {state === "done" ? <Check className="h-4 w-4" aria-hidden /> : index + 1}
                  </span>
                  <span className="coe-step-name">{step.title}</span>
                </div>
                {index < PERMISSION_STEPS.length - 1 ? <span className="coe-step-line" /> : null}
              </li>
            );
          })}
        </ol>

        <form className="coe-form" onSubmit={(event) => event.preventDefault()}>
          {currentStep === 0 && (
            <section aria-labelledby="step-schedule-title" className="coe-section">
              <div>
                <h2 id="step-schedule-title" className="coe-section-title">
                  Department &amp; Schedule
                </h2>
              </div>

              <div>
                <Label
                  htmlFor="permission-department"
                  className="text-sm font-bold text-foreground"
                >
                  Department / Office <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="permission-department"
                  value={department}
                  maxLength={190}
                  placeholder="e.g. College of Computer Studies"
                  aria-invalid={Boolean(fieldErrors.department)}
                  aria-describedby={
                    fieldErrors.department
                      ? "permission-department-help permission-department-error"
                      : "permission-department-help"
                  }
                  onChange={(event) => {
                    setDepartment(event.target.value);
                    clearFieldError("department");
                  }}
                  className="coe-input text-base font-medium"
                />
                <p id="permission-department-help" className="permission-field-hint">
                  Enter your current department or office.
                </p>
                <FieldError id="permission-department-error" message={fieldErrors.department} />
              </div>

              <div className="coe-fields coe-fields-schedule">
                <div>
                  <Label htmlFor="permission-date" className="text-sm font-bold text-foreground">
                    Date Leaving <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="permission-date"
                    type="date"
                    min={today}
                    value={requestedDate}
                    aria-invalid={Boolean(fieldErrors.requestedDate)}
                    aria-describedby={
                      fieldErrors.requestedDate
                        ? "permission-date-help permission-date-error"
                        : "permission-date-help"
                    }
                    onChange={(event) => {
                      setRequestedDate(event.target.value);
                      clearFieldError("requestedDate");
                    }}
                    className="coe-input text-base font-medium"
                  />
                  <p id="permission-date-help" className="permission-field-hint">
                    Choose today or a future date.
                  </p>
                  <FieldError id="permission-date-error" message={fieldErrors.requestedDate} />
                </div>
                <div>
                  <Label
                    htmlFor="permission-time-out"
                    className="text-sm font-bold text-foreground"
                  >
                    Time Out <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="permission-time-out"
                    type="time"
                    value={timeOut}
                    aria-invalid={Boolean(fieldErrors.timeOut)}
                    aria-describedby={fieldErrors.timeOut ? "permission-time-out-error" : undefined}
                    onChange={(event) => {
                      setTimeOut(event.target.value);
                      clearFieldError("timeOut");
                    }}
                    className="coe-input text-base font-medium"
                  />
                  <FieldError id="permission-time-out-error" message={fieldErrors.timeOut} />
                </div>
                <div>
                  <Label htmlFor="permission-time-in" className="text-sm font-bold text-foreground">
                    Time In <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="permission-time-in"
                    type="time"
                    value={timeIn}
                    aria-invalid={Boolean(fieldErrors.timeIn)}
                    aria-describedby={
                      fieldErrors.timeIn ? "permission-time-in-error" : "permission-time-help"
                    }
                    onChange={(event) => {
                      setTimeIn(event.target.value);
                      clearFieldError("timeIn");
                    }}
                    className="coe-input text-base font-medium"
                  />
                  <FieldError id="permission-time-in-error" message={fieldErrors.timeIn} />
                </div>
              </div>
            </section>
          )}

          {currentStep === 1 && (
            <section aria-labelledby="step-reason-title" className="coe-section">
              <div>
                <h2 id="step-reason-title" className="coe-section-title">
                  Reason
                </h2>
                <p className="coe-section-description">State why you are leaving campus.</p>
              </div>

              <div>
                <Label htmlFor="permission-reason" className="text-sm font-bold text-foreground">
                  Reason <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="permission-reason"
                  name="reason"
                  value={reason}
                  maxLength={500}
                  aria-invalid={Boolean(fieldErrors.reason)}
                  aria-describedby={fieldErrors.reason ? "permission-reason-error" : undefined}
                  onChange={(event) => {
                    setReason(event.target.value);
                    clearFieldError("reason");
                  }}
                  placeholder="Where are you going and why?"
                  rows={6}
                  className="coe-input"
                />
                <div className="permission-field-hint flex justify-between gap-3">
                  <span>Minimum 5 characters.</span>
                  <span>{reason.length}/500</span>
                </div>
                <FieldError id="permission-reason-error" message={fieldErrors.reason} />
              </div>
            </section>
          )}

          {currentStep === 2 && (
            <section aria-labelledby="step-signature-title" className="coe-section">
              <div>
                <h2 id="step-signature-title" className="coe-section-title">
                  Signature
                </h2>
                <p className="coe-section-description">Draw your signature or upload an image.</p>
              </div>

              <div
                aria-invalid={Boolean(fieldErrors.signature)}
                aria-describedby={fieldErrors.signature ? "permission-signature-error" : undefined}
                className="space-y-4"
              >
                <SignaturePad
                  onChange={(value) => {
                    setSignature(value);
                    clearFieldError("signature");
                  }}
                />
                <FieldError id="permission-signature-error" message={fieldErrors.signature} />

                <div className="coe-notice text-xs sm:text-sm">
                  <p>
                    By signing, you confirm that you informed your immediate supervisor and will
                    follow Lyceum of Alabang policies.
                  </p>
                </div>
              </div>
            </section>
          )}

          {currentStep === 3 && (
            <section aria-labelledby="step-review-title" className="coe-section">
              <div>
                <h2 id="step-review-title" className="coe-section-title">
                  Review
                </h2>
                <p className="coe-section-description">
                  Check your details before submitting for HRDO Director approval.
                </p>
              </div>

              <dl className="coe-summary-grid grid gap-4 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="text-xs font-semibold text-muted-foreground">Name</dt>
                  <dd className="mt-1 text-base font-bold text-foreground">
                    {permissionViewer?.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-muted-foreground">
                    Department / Office
                  </dt>
                  <dd className="mt-1 text-base font-bold text-foreground">
                    {department.trim() || "Not provided"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-muted-foreground">Date</dt>
                  <dd className="mt-1 text-base font-bold text-foreground">
                    {formatPhilippineDate(requestedDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-muted-foreground">Hours</dt>
                  <dd className="mt-1 text-base font-bold text-foreground">
                    {timeOut} — {timeIn}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold text-muted-foreground">Reason</dt>
                  <dd className="coe-review-reason mt-1.5 p-4 text-base font-semibold">{reason}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold text-muted-foreground">Signature</dt>
                  <dd className="mt-2">
                    {signature?.image ? (
                      <div className="flex h-24 max-w-xs items-center justify-center rounded-lg border bg-white p-3">
                        <img
                          src={signature.image}
                          alt="Signature preview"
                          className="max-h-20 max-w-full object-contain"
                        />
                      </div>
                    ) : (
                      <span className="text-sm font-semibold text-destructive">
                        No signature provided
                      </span>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="coe-confirmation flex items-start gap-3 p-4">
                <Checkbox
                  id="confirm-permission-review"
                  checked={confirmedAgreement}
                  onCheckedChange={(checked) => {
                    setConfirmedAgreement(checked === true);
                    clearFieldError("form");
                  }}
                  className="mt-0.5"
                />
                <Label
                  htmlFor="confirm-permission-review"
                  className="text-xs sm:text-sm font-medium leading-relaxed text-foreground"
                >
                  I certify that the details are true and complete and submit this Permission Slip
                  for HRDO Director approval.
                </Label>
              </div>
              <FieldError id="permission-form-error" message={fieldErrors.form} />
            </section>
          )}

          {/* Wizard Navigation Footer */}
          <div className="coe-footer">
            <div className="coe-footer-inner">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="coe-button coe-button-back gap-2"
                disabled={currentStep === 0 || busy}
                onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back
              </Button>

              <span className="coe-footer-step">
                Step {currentStep + 1} of {PERMISSION_STEPS.length}
              </span>

              {currentStep < lastStepIndex ? (
                <Button
                  type="button"
                  size="lg"
                  className="coe-button coe-button-next gap-2"
                  onClick={handleNext}
                >
                  Next
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  className="coe-button coe-button-next gap-2"
                  disabled={!confirmedAgreement || busy}
                  onClick={() => setShowConfirm(true)}
                >
                  {busy ? <ButtonLoading label="Submitting…" /> : "Submit Permission Slip"}
                </Button>
              )}
            </div>
          </div>
        </form>

        {/* Confirmation Modal */}
        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Submit Permission Slip?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span className="block">
                  Submit this request for <strong>{formatPhilippineDate(requestedDate)}</strong> (
                  {timeOut} — {timeIn})?
                </span>
                <span className="block rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  It will be sent to the HRDO Director for approval.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleFinalSubmit()} disabled={busy}>
                {busy ? <ButtonLoading label="Submitting…" /> : "Submit Request"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
