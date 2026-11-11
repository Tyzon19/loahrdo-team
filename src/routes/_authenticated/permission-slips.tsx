import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  FilePlus2,
  FileText,
  Info,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { isPermissionHead } from "@/lib/permission-access";
import { isPermissionSlipDetailPath } from "@/lib/permission-routing";
import {
  listMyPermissionSlipsFn,
  listPendingPermissionSlipsFn,
  submitPermissionSlipFn,
} from "@/server-functions";

type PermissionSearch = {
  view?: "history" | "new" | undefined;
};

export const Route = createFileRoute("/_authenticated/permission-slips")({
  validateSearch: (search: Record<string, unknown>): PermissionSearch => ({
    view:
      search["view"] === "history"
        ? "history"
        : search["view"] === "new"
          ? "new"
          : undefined,
  }),
  component: PermissionSlipsPage,
});

const PERMISSION_STEPS = [
  {
    key: "schedule",
    title: "Schedule",
    blurb: "Indicate the date and specific departure & return times for leaving campus.",
  },
  {
    key: "reason",
    title: "Reason",
    blurb: "Provide the reason for leaving campus during working hours.",
  },
  {
    key: "signature",
    title: "Signature",
    blurb: "Provide your electronic signature to certify this permission slip.",
  },
  {
    key: "review",
    title: "Review",
    blurb: "Review your information and confirm submission for HRDO Director approval.",
  },
] as const;

const REASON_TEMPLATES = [
  "Official School Business / Off-campus Task",
  "Personal Urgent Matter / Family Emergency",
  "Medical / Dental Appointment",
  "Government Agency Transaction (SSS / PhilHealth / Pag-IBIG)",
  "Bank / Financial Institution Errand",
];

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
    <p id={id} role="alert" className="mt-1.5 text-xs font-semibold text-destructive">
      {message}
    </p>
  ) : null;
}

function PermissionSlipsPage() {
  const pathname = useRouterState({ select: (router) => router.location.pathname });
  const isDetailRoute = isPermissionSlipDetailPath(pathname);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { viewer } = Route.useRouteContext();
  const isHead = isPermissionHead(viewer);
  const queryClient = useQueryClient();

  const isHistoryView = search.view === "history";
  const isExplicitNewView = search.view === "new";

  const employeeQuery = useQuery({
    queryKey: ["permission-slips", "mine"],
    queryFn: () => unwrap(listMyPermissionSlipsFn()),
    enabled: (!isHead || isHistoryView) && !isDetailRoute,
  });

  const pendingQuery = useQuery({
    queryKey: ["permission-slips", "pending"],
    queryFn: () => unwrap(listPendingPermissionSlipsFn()),
    enabled: isHead && !isHistoryView && !isExplicitNewView && !isDetailRoute,
  });

  if (isDetailRoute) return <Outlet />;

  // Multi-step form state
  const [currentStep, setCurrentStep] = useState(0);
  const [requestedDate, setRequestedDate] = useState("");
  const [timeOut, setTimeOut] = useState("");
  const [timeIn, setTimeIn] = useState("");
  const [reason, setReason] = useState("");
  const [signature, setSignature] = useState<SignatureValue | null>(null);
  const [confirmedAgreement, setConfirmedAgreement] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"requestedDate" | "timeOut" | "timeIn" | "reason" | "signature" | "form", string>>
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
      if (!requestedDate) errors.requestedDate = "Choose the date you will leave campus.";
      else if (requestedDate < today) errors.requestedDate = "Choose today or a future date.";

      if (!timeOut) errors.timeOut = "Enter the time you will leave campus.";
      if (!timeIn) errors.timeIn = "Enter your expected return time.";
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
          <Button
            className="gap-2 shrink-0"
            onClick={() => void navigate({ search: { view: isHead ? "new" : undefined } })}
          >
            <FilePlus2 className="h-4 w-4" />
            Request Permission Slip
          </Button>
        </div>

        {employeeQuery.isPending ? (
          <LoadingScreen label="Loading your permission slips" mode="inline" />
        ) : null}

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
                      <Button variant="ghost" size="sm" className="gap-1 text-xs">
                        View Details
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}

          {!employeeQuery.data?.length && !employeeQuery.isPending && (
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
                <Button
                  className="mt-4 gap-2"
                  onClick={() => void navigate({ search: { view: isHead ? "new" : undefined } })}
                >
                  <FilePlus2 className="h-4 w-4" />
                  Request Permission Slip
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // ── VIEW 2: HR DIRECTOR REVIEW QUEUE (when head visits without search) ──────
  if (isHead && !isExplicitNewView) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 py-4 sm:py-6">
        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">HRDO</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Permission Slip Review
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Review, verify, and electronically sign permission slips submitted by school personnel.
            </p>
          </div>
          <Button
            variant="outline"
            className="gap-2 shrink-0"
            onClick={() => void navigate({ search: { view: "new" } })}
          >
            <FilePlus2 className="h-4 w-4" />
            File Permission Slip
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
                      {slip.department} · {formatPhilippineDate(slip.requestedDate)} ({slip.timeOut} — {slip.timeIn})
                    </p>
                    <p className="mt-2 line-clamp-1 text-sm text-foreground/90 font-medium">
                      {slip.reason}
                    </p>
                  </div>
                  <Button size="sm" className="gap-1.5 shrink-0">
                    Review
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
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
              <img
                src="/lyceum-logo.png.png"
                alt="Lyceum of Alabang seal"
                width={72}
                height={72}
              />
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
              Your request has been submitted to the Human Resources Development Office (HRDO).
            </p>
            <p className="coe-success-message">
              The HRDO Director will review and sign your permission slip. We will send an update to{" "}
              <strong>{viewer?.email}</strong> once your slip is approved or if additional details
              are requested.
            </p>
            {emailSent === false && (
              <p role="status" className="coe-success-message text-amber-700">
                Your request was recorded in the database, but the HRDO notification email could not
                be dispatched immediately. You can still track your request below.
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
    <div className="mx-auto w-full max-w-4xl space-y-6 py-4 sm:py-8">
      {busy && <LoadingScreen label="Submitting Permission Slip" mode="overlay" immediate />}

      <main className="w-full space-y-6">
        {/* Intro header with seal & title */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3 mb-2">
            <img
              src="/lyceum-logo.png.png"
              alt="Lyceum of Alabang seal"
              className="h-12 w-12 object-contain"
            />
            <img
              src="/HRDO%20LOGO.png"
              alt="HRDO logo"
              className="h-11 w-11 object-contain"
            />
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Human Resource Development Office
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Permission Slip Request
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
            {currentStepConfig.blurb}
          </p>
        </div>

        {/* 4-Step Progress Indicator (Spacious & Prominent) */}
        <ol
          className="coe-steps my-4"
          aria-label="Request progress"
          style={{ gridTemplateColumns: `repeat(${PERMISSION_STEPS.length}, minmax(0, 1fr))` }}
        >
          {PERMISSION_STEPS.map((step, index) => {
            const state =
              index < currentStep ? "done" : index === currentStep ? "active" : "upcoming";
            return (
              <li key={step.key} className="coe-step" data-state={state}>
                <div className="coe-step-content">
                  <span className="coe-step-circle h-9 w-9 text-sm font-bold">
                    {state === "done" ? <Check className="h-4 w-4" aria-hidden /> : index + 1}
                  </span>
                  <span className="coe-step-name text-xs sm:text-sm font-bold">{step.title}</span>
                </div>
                {index < PERMISSION_STEPS.length - 1 ? <span className="coe-step-line" /> : null}
              </li>
            );
          })}
        </ol>

        {/* Form Card (Roomy, large inputs, no auto name/department) */}
        <Card className="border shadow-sm">
          <CardContent className="p-6 sm:p-10 space-y-6">
            {/* ── STEP 0: SCHEDULE (Date, Time Out, Time In) ─────────────── */}
            {currentStep === 0 && (
              <section aria-labelledby="step-schedule-title" className="space-y-6">
                <div>
                  <h2
                    id="step-schedule-title"
                    className="text-xl sm:text-2xl font-bold tracking-tight text-foreground"
                  >
                    Off-Campus Schedule
                  </h2>
                  <p className="mt-1 text-sm sm:text-base text-muted-foreground">
                    Select the date you will leave campus and your expected departure and return
                    times.
                  </p>
                </div>

                <div className="grid gap-6 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="permission-date" className="text-sm font-bold text-foreground">
                      Date Leaving Campus <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="permission-date"
                      type="date"
                      min={today}
                      value={requestedDate}
                      aria-invalid={Boolean(fieldErrors.requestedDate)}
                      aria-describedby={
                        fieldErrors.requestedDate ? "permission-date-error" : undefined
                      }
                      onChange={(event) => {
                        setRequestedDate(event.target.value);
                        clearFieldError("requestedDate");
                      }}
                      className="mt-2 min-h-12 text-base font-medium"
                    />
                    <FieldError id="permission-date-error" message={fieldErrors.requestedDate} />
                  </div>

                  <div>
                    <Label
                      htmlFor="permission-time-out"
                      className="text-sm font-bold text-foreground"
                    >
                      Time Out (Departure) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="permission-time-out"
                      type="time"
                      value={timeOut}
                      aria-invalid={Boolean(fieldErrors.timeOut)}
                      aria-describedby={
                        fieldErrors.timeOut ? "permission-time-out-error" : undefined
                      }
                      onChange={(event) => {
                        setTimeOut(event.target.value);
                        clearFieldError("timeOut");
                      }}
                      className="mt-2 min-h-12 text-base font-medium"
                    />
                    <FieldError id="permission-time-out-error" message={fieldErrors.timeOut} />
                  </div>

                  <div>
                    <Label
                      htmlFor="permission-time-in"
                      className="text-sm font-bold text-foreground"
                    >
                      Time In (Expected Return) <span className="text-destructive">*</span>
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
                      className="mt-2 min-h-12 text-base font-medium"
                    />
                    <FieldError id="permission-time-in-error" message={fieldErrors.timeIn} />
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/40 p-4 text-xs sm:text-sm text-muted-foreground flex items-start gap-2.5">
                  <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <p id="permission-time-help">
                    Departure and return must occur within the same workday. Time In must be later
                    than Time Out. Your employee name (<strong>{viewer?.name}</strong>) and department (
                    <strong>{viewer?.department}</strong>) are automatically tied to this submission.
                  </p>
                </div>
              </section>
            )}

            {/* ── STEP 1: REASON ─────────────────────────────────────────── */}
            {currentStep === 1 && (
              <section aria-labelledby="step-reason-title" className="space-y-6">
                <div>
                  <h2
                    id="step-reason-title"
                    className="text-xl sm:text-2xl font-bold tracking-tight text-foreground"
                  >
                    Reason for Going Out
                  </h2>
                  <p className="mt-1 text-sm sm:text-base text-muted-foreground">
                    State the specific purpose of your off-campus absence. This will appear on your
                    official ISO 9001:2015 permission slip.
                  </p>
                </div>

                {/* Quick suggestions */}
                <div className="space-y-2">
                  <span className="text-xs sm:text-sm font-bold text-muted-foreground">
                    Common suggestions (click to use):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {REASON_TEMPLATES.map((tmpl) => (
                      <button
                        key={tmpl}
                        type="button"
                        onClick={() => {
                          setReason(tmpl);
                          clearFieldError("reason");
                        }}
                        className="rounded-full border border-border bg-muted/50 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                      >
                        {tmpl}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label
                    htmlFor="permission-reason"
                    className="text-sm font-bold text-foreground"
                  >
                    Detailed Reason <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="permission-reason"
                    name="reason"
                    value={reason}
                    maxLength={500}
                    aria-invalid={Boolean(fieldErrors.reason)}
                    aria-describedby={
                      fieldErrors.reason ? "permission-reason-error" : "permission-reason-help"
                    }
                    onChange={(event) => {
                      setReason(event.target.value);
                      clearFieldError("reason");
                    }}
                    placeholder="Provide clear details on where you are going and why…"
                    rows={6}
                    className="mt-2 min-h-[140px] text-base p-3.5 leading-relaxed"
                  />
                  <div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground">
                    <span id="permission-reason-help">Minimum 5 characters.</span>
                    <span>{reason.length}/500</span>
                  </div>
                  <FieldError id="permission-reason-error" message={fieldErrors.reason} />
                </div>
              </section>
            )}

            {/* ── STEP 2: SIGNATURE ──────────────────────────────────────── */}
            {currentStep === 2 && (
              <section aria-labelledby="step-signature-title" className="space-y-6">
                <div>
                  <h2
                    id="step-signature-title"
                    className="text-xl sm:text-2xl font-bold tracking-tight text-foreground"
                  >
                    Employee Electronic Signature
                  </h2>
                  <p className="mt-1 text-sm sm:text-base text-muted-foreground">
                    Draw your signature inside the box or upload an existing signature image to
                    certify this request.
                  </p>
                </div>

                <div
                  aria-invalid={Boolean(fieldErrors.signature)}
                  aria-describedby={
                    fieldErrors.signature ? "permission-signature-error" : undefined
                  }
                  className="space-y-4"
                >
                  <SignaturePad
                    onChange={(value) => {
                      setSignature(value);
                      clearFieldError("signature");
                    }}
                  />
                  <FieldError id="permission-signature-error" message={fieldErrors.signature} />

                  <div className="rounded-lg border bg-muted/30 p-4 text-xs sm:text-sm text-muted-foreground">
                    <p>
                      Signing as <strong className="text-foreground">{viewer?.name}</strong> (
                      {viewer?.department}). Your signature certifies that you have informed your
                      immediate supervisor and will follow Lyceum of Alabang policies during your
                      absence.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* ── STEP 3: REVIEW & CONFIRMATION ──────────────────────────── */}
            {currentStep === 3 && (
              <section aria-labelledby="step-review-title" className="space-y-6">
                <div>
                  <h2
                    id="step-review-title"
                    className="text-xl sm:text-2xl font-bold tracking-tight text-foreground"
                  >
                    Review Request Details
                  </h2>
                  <p className="mt-1 text-sm sm:text-base text-muted-foreground">
                    Carefully review your information before submitting to the HRDO Director for
                    approval.
                  </p>
                </div>

                <dl className="grid gap-4 sm:grid-cols-2 rounded-xl border bg-muted/20 p-5 text-sm">
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">Employee Name</dt>
                    <dd className="mt-1 text-base font-bold text-foreground">{viewer?.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">Department / Office</dt>
                    <dd className="mt-1 text-base font-bold text-foreground">
                      {viewer?.department}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">Date of Leaving</dt>
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
                    <dt className="text-xs font-semibold text-muted-foreground">
                      Reason for Going Out
                    </dt>
                    <dd className="mt-1.5 rounded-lg border-l-4 border-l-amber-500 bg-amber-50/80 p-4 text-base font-semibold text-slate-950">
                      {reason}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold text-muted-foreground">
                      Electronic Signature
                    </dt>
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

                <div className="flex items-start gap-3 rounded-lg border p-4 bg-card">
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
                    I certify that all details above are true and complete, and I submit this
                    Permission Slip for official HRDO Director review and approval.
                  </Label>
                </div>
                <FieldError id="permission-form-error" message={fieldErrors.form} />
              </section>
            )}

            {/* Wizard Navigation Footer */}
            <div className="flex items-center justify-between border-t pt-6 gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="gap-2 min-h-12 px-5 text-sm sm:text-base font-semibold"
                disabled={currentStep === 0 || busy}
                onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back
              </Button>

              <span className="text-xs sm:text-sm font-bold text-muted-foreground">
                Step {currentStep + 1} of {PERMISSION_STEPS.length}
              </span>

              {currentStep < lastStepIndex ? (
                <Button
                  type="button"
                  size="lg"
                  className="gap-2 min-h-12 px-6 text-sm sm:text-base font-bold"
                  onClick={handleNext}
                >
                  Next
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  className="gap-2 min-h-12 px-6 text-sm sm:text-base font-bold"
                  disabled={!confirmedAgreement || busy}
                  onClick={() => setShowConfirm(true)}
                >
                  {busy ? <ButtonLoading label="Submitting…" /> : "Submit Permission Slip"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Confirmation Modal */}
        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Permission Slip Submission</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span className="block">
                  Are you sure you want to submit this permission slip for{" "}
                  <strong>{formatPhilippineDate(requestedDate)}</strong> ({timeOut} — {timeIn})?
                </span>
                <span className="block rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <strong>Notice:</strong> Your request will be forwarded immediately to the HRDO
                  Director for electronic review and approval.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleFinalSubmit()} disabled={busy}>
                {busy ? <ButtonLoading label="Submitting…" /> : "Yes, Submit Request"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
