import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  FileText,
  Info,
  Layers,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, Section } from "@/components/app/PageHeader";
import { ButtonLoading, LoadingScreen } from "@/components/app/LoadingPanel";
import { submitCoeRequestFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
import { joinFullName } from "@/lib/name";
import { normalizePhilippineMobileNumber } from "@/lib/validation";
import { COE_COPY_TYPE_LABELS, HRDO, type CoeCopyType } from "@/lib/hrdo";
import {
  COE_DEPARTMENTS,
  COE_DESCRIPTION_OPTIONS,
  COE_DESCRIPTION_OTHER,
  COE_DESCRIPTION_TEXT_OPTIONS,
  COE_EMPLOYMENT_STATUSES,
  COE_TITLES,
  formatStoredDescription,
} from "@/lib/coe-form";

const COE_STEPS = [
  {
    key: "type",
    title: "Request type",
    blurb: "Choose whether this is your own certificate or a verification for another employer.",
  },
  {
    key: "details",
    title: "Request details",
    blurb: "Schedule, delivery, and the information HRDO needs to prepare the certificate.",
  },
  {
    key: "review",
    title: "Review",
    blurb: "Read each line. Use Back if something is wrong.",
  },
] as const;

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addWorkingDays(start: Date, count: number) {
  const date = new Date(start);
  let remaining = count;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const weekday = date.getDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return localDateValue(date);
}

export const Route = createFileRoute("/hrdo/coe")({
  beforeLoad: ({ context }) => {
    if (context.hrdoViewer?.role === "hrdo_staff") {
      throw redirect({ to: "/hrdo/requests" });
    }
  },
  head: () => ({
    meta: [
      { title: `COE Request · ${HRDO.shortName}` },
      { name: "description", content: "Submit and track a Certificate of Employment request." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CoeRequestPage,
});

function CoeRequestPage() {
  const { hrdoViewer } = Route.useRouteContext();
  const viewerEmail = hrdoViewer?.email ?? "";
  const queryClient = useQueryClient();
  const [requestorType, setRequestorType] = useState<"internal" | "third_party" | null>(null);
  const [purpose, setPurpose] = useState("");
  const [descriptionOptions, setDescriptionOptions] = useState<string[]>([]);
  const [descriptionDetails, setDescriptionDetails] = useState<Record<string, string>>({});
  const [customDescription, setCustomDescription] = useState("");
  const [note, setNote] = useState("");
  const [dateNeeded, setDateNeeded] = useState(() => addWorkingDays(new Date(), 3));
  const [employeeEmail, setEmployeeEmail] = useState(viewerEmail);
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [employeeName, setEmployeeName] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
  });
  const [employeeTitle, setEmployeeTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [customDepartment, setCustomDepartment] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("");
  const [copyType, setCopyType] = useState<CoeCopyType>("original");
  const [verifierCompany, setVerifierCompany] = useState("");
  const [verifierName, setVerifierName] = useState("");
  const [verifierEmail, setVerifierEmail] = useState("");
  const [verifierContact, setVerifierContact] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectTitle, setSubjectTitle] = useState("");
  const [subjectDob, setSubjectDob] = useState("");
  const [employmentEndDate, setEmploymentEndDate] = useState("");
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [submissionSummary, setSubmissionSummary] = useState<{
    email: string;
    copyType: CoeCopyType;
  } | null>(null);

  const dateRequested = localDateValue(new Date());
  const minimumDateNeeded = addWorkingDays(new Date(), 3);
  const previewEmployeeName = joinFullName(employeeName);

  const submit = useMutation({
    mutationFn: async () => {
      const internalDepartment =
        department === "Other" ? customDepartment.trim() : department.trim();
      const normalizedVerifierContact =
        requestorType === "third_party" ? normalizePhilippineMobileNumber(verifierContact) : "";
      if (requestorType === "third_party" && !normalizedVerifierContact) {
        throw new Error("Enter a valid Philippine mobile number.");
      }
      const combinedNote = [
        note.trim(),
        requestorType === "internal"
          ? [
              `Requestor type: Internal Employee`,
              `Title: ${employeeTitle}`,
              `Department: ${internalDepartment || "Not provided"}`,
              `Date requested: ${dateRequested}`,
              `Date needed: ${dateNeeded}`,
              `Description: ${formatStoredDescription(
                descriptionOptions,
                descriptionDetails,
                customDescription,
              )}`,
              `Employment status: ${employmentStatus || "Not provided"}`,
              `Date hired: Not provided`,
              `Copy/delivery: ${COE_COPY_TYPE_LABELS[copyType]}`,
            ].join(" | ")
          : [
              `Requestor type: Third-Party Verifier`,
              `Subject title: ${subjectTitle}`,
              `Verifier company: ${verifierCompany || "Not provided"}`,
              `Authorized representative: ${verifierName || "Not provided"}`,
              `Contact number: ${normalizedVerifierContact || "Not provided"}`,
              `Employee to verify: ${subjectName || "Not provided"}`,
              `Date hired: ${subjectDob || "Not provided"}`,
              `Employment end date: ${employmentEndDate || "Present"}`,
              `Date requested: ${dateRequested}`,
              `Date needed: ${dateNeeded}`,
              `Copy/delivery: ${COE_COPY_TYPE_LABELS[copyType]}`,
              `Description: ${formatStoredDescription(
                descriptionOptions,
                descriptionDetails,
                customDescription,
              )}`,
            ].join(" | "),
      ]
        .filter(Boolean)
        .join("\n");

      const submittedDepartment =
        requestorType === "internal"
          ? department === "Other"
            ? customDepartment.trim()
            : department.trim()
          : "Third-party verification";

      return unwrap(
        submitCoeRequestFn({
          data: {
            purpose:
              requestorType === "third_party"
                ? "Third-party verification / employment verification"
                : purpose.trim(),
            note: combinedNote,
            employeeEmail:
              requestorType === "third_party" ? verifierEmail.trim() : employeeEmail.trim(),
            employeeNumber: employeeNumber.trim(),
            contactNumber: requestorType === "third_party" ? normalizedVerifierContact : "",
            employeeName:
              requestorType === "third_party" ? subjectName.trim() : joinFullName(employeeName),
            department: submittedDepartment,
            copyType,
          },
        }),
      );
    },
    onSuccess: async () => {
      setPurpose("");
      setDescriptionOptions([]);
      setDescriptionDetails({});
      setCustomDescription("");
      setNote("");
      setDateNeeded(addWorkingDays(new Date(), 3));
      setEmployeeEmail(viewerEmail);
      setEmployeeNumber("");
      setEmployeeName({
        firstName: "",
        middleName: "",
        lastName: "",
      });
      setEmployeeTitle("");
      setDepartment("");
      setCustomDepartment("");
      setEmploymentStatus("");
      setCopyType("original");
      setVerifierCompany("");
      setVerifierName("");
      setVerifierEmail("");
      setVerifierContact("");
      setSubjectName("");
      setSubjectTitle("");
      setSubjectDob("");
      setEmploymentEndDate("");
      setDescriptionOptions([]);
      setDescriptionDetails({});
      setCustomDescription("");
      setPrivacyChecked(false);
      setRequestorType(null);
      await queryClient.invalidateQueries({ queryKey: ["coe"] });
    },
  });

  if (!hrdoViewer) return null;

  const currentBatch = COE_STEPS[currentStep] ?? COE_STEPS[0];
  const lastStep = COE_STEPS.length - 1;

  if (submit.isSuccess && submit.data && submissionSummary) {
    return (
      <div className="coe-request">
        <main className="coe-success-wrap">
          <section className="panel coe-success-card" aria-labelledby="coe-success-title">
            <div className="coe-success-logos" aria-label="Lyceum of Alabang and HRDO">
              <img src="/lyceum-logo.png.png" alt="Lyceum of Alabang seal" />
              <img src="/HRDO%20LOGO.png" alt="Human Resources Development Office logo" />
            </div>
            <div className="coe-success-icon" aria-hidden="true">
              <Check />
            </div>
            <h1 id="coe-success-title">COE Request Successful</h1>
            <p className="coe-success-lead">
              Your request has been submitted to the Human Resources Development Office.
            </p>
            <p className="coe-success-message">
              Please allow <strong>3 working days</strong> for processing. We will email you at{" "}
              <strong>{submissionSummary.email}</strong> when there is an update or if we need more
              information.
            </p>
            {submissionSummary.copyType !== "soft" && (
              <p className="coe-success-message">
                You will receive an email when your hardcopy is ready for pickup at HRDO.
              </p>
            )}
            <p className="coe-success-reference">
              Request reference: <strong>{submit.data.id}</strong>
            </p>
            <div className="coe-success-actions">
              <Button asChild>
                <Link to="/hrdo/coe/$id" params={{ id: submit.data.id }}>
                  View request status
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  submit.reset();
                  setSubmissionSummary(null);
                  setCurrentStep(0);
                }}
              >
                Submit another request
              </Button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  function missingDescription() {
    if (!descriptionOptions.length) return "Choose at least one document or description.";
    if (descriptionOptions.includes(COE_DESCRIPTION_OTHER) && !customDescription.trim()) {
      return "Specify the other description.";
    }
    const missing = descriptionOptions.find(
      (option) => COE_DESCRIPTION_TEXT_OPTIONS.has(option) && !descriptionDetails[option]?.trim(),
    );
    return missing ? `Complete the "${missing}" field.` : "";
  }

  function stepError(step: number) {
    const key = COE_STEPS[step]?.key;
    if (key === "type" && !requestorType) {
      return "Choose Employee request or Third-party verification.";
    }
    if (key === "details") {
      if (!dateNeeded || dateNeeded < minimumDateNeeded) {
        return "Choose a date needed at least 3 working days from today.";
      }
      const descriptionError = missingDescription();
      if (descriptionError) return descriptionError;
      if (requestorType === "internal") {
        if (!employeeTitle) return "Select a title.";
        if (employeeName.firstName.trim().length < 2) return "Enter your first name.";
        if (employeeName.lastName.trim().length < 2) return "Enter your last name.";
        if (
          !employeeEmail.trim() ||
          !/^[^\s@]+@lyceumalabang\.edu\.ph$/i.test(employeeEmail.trim())
        ) {
          return "Use your official email: name@lyceumalabang.edu.ph";
        }
        if (employeeNumber.trim() && employeeNumber.trim().length < 3) {
          return "Employee ID must be 3 or more characters if provided.";
        }
        const departmentName = department === "Other" ? customDepartment.trim() : department.trim();
        if (!departmentName) return "Choose your department or office, or specify Other.";
        if (!employmentStatus) return "Select your employment status.";
        if (purpose.trim().length < 5) return "Enter the purpose of use.";
      }
      if (requestorType === "third_party") {
        if (!verifierCompany.trim()) return "Enter the verifying company or agency name.";
        if (!verifierName.trim()) return "Enter the authorized representative name.";
        if (!verifierEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verifierEmail)) {
          return "Enter a valid company or work email.";
        }
        if (!normalizePhilippineMobileNumber(verifierContact)) {
          return "Enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).";
        }
        if (!subjectName.trim()) return "Enter the employee name.";
        if (!subjectTitle) return "Select a title for the employee to verify.";
        if (!subjectDob) return "Enter the hiring date.";
        if (subjectDob > dateRequested) return "Date hired cannot be in the future.";
        if (!employmentEndDate) return "Enter the last day of employment.";
        if (employmentEndDate < subjectDob) {
          return "Last day of employment must be on or after the hiring date.";
        }
        if (employmentEndDate > dateRequested) {
          return "Last day of employment cannot be in the future.";
        }
      }
    }
    if (key === "review") {
      if (!privacyChecked) return "Agree to the data privacy statement before submitting.";
      if (requestorType === "internal" && joinFullName(employeeName).length < 5) {
        return "Enter employee name.";
      }
    }
    return "";
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = stepError(currentStep);
    if (error) {
      toast.error(error);
      return;
    }
    if (currentStep < lastStep) {
      setCurrentStep(currentStep + 1);
      return;
    }
    setShowConfirm(true);
  }

  function confirmSubmit() {
    setShowConfirm(false);
    setSubmissionSummary({
      email: requestorType === "third_party" ? verifierEmail : employeeEmail,
      copyType,
    });
    submit.mutate();
  }

  return (
    <>
      {submit.isPending && (
        <LoadingScreen label="Submitting your COE request" mode="overlay" immediate />
      )}
      <div className="coe-request">
        <main className="coe-main">
          <PageHeader title="CERTIFICATE OF EMPLOYMENT" description={currentBatch.blurb} />
          <ol className="coe-steps" aria-label="Request progress">
            {COE_STEPS.map((step, index) => {
              const state =
                index === currentStep ? "active" : index < currentStep ? "done" : "upcoming";
              return (
                <li key={step.key} className="coe-step" data-state={state}>
                  <div className="coe-step-content">
                    <span className="coe-step-circle">
                      {state === "done" ? <Check aria-hidden /> : index + 1}
                    </span>
                    <span className="coe-step-name">{step.title}</span>
                  </div>
                  {index < COE_STEPS.length - 1 ? <span className="coe-step-line" /> : null}
                </li>
              );
            })}
          </ol>
          <form className="coe-form" onSubmit={onSubmit} noValidate>
            {currentStep === 0 && (
              <Section title="What type of request are you making?">
                <p className="coe-section-description">
                  Choose the option that best describes your request to continue.
                </p>
                <RadioGroup
                  value={requestorType ?? ""}
                  onValueChange={(value) => {
                    if (value !== "internal" && value !== "third_party") return;
                    setRequestorType(value);
                    setEmploymentEndDate("");
                  }}
                  className="coe-request-types"
                >
                  <label htmlFor="requestor-internal" className="coe-request-type">
                    <RadioGroupItem value="internal" id="requestor-internal" className="mt-0.5" />
                    <span>
                      <span className="block font-medium">Request my own certificate</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        Request a COE for your own employment records.
                      </span>
                    </span>
                  </label>
                  <label htmlFor="requestor-third-party" className="coe-request-type">
                    <RadioGroupItem
                      value="third_party"
                      id="requestor-third-party"
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block font-medium">Third-Party Employment Verification</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        Verify a former employee&apos;s work history for a new or current employer.
                      </span>
                    </span>
                  </label>
                </RadioGroup>
              </Section>
            )}

            {currentStep === 1 && (
              <>
                <Section title="Request schedule">
                  <p className="coe-section-description">When do you need your certificate?</p>
                  <div className="coe-fields coe-fields-schedule">
                    <div className="coe-date-wrap">
                      <CalendarDays className="coe-date-icon" aria-hidden />
                      <Label htmlFor="date-requested">Date requested</Label>
                      <Input
                        id="date-requested"
                        className="coe-input coe-input-readonly"
                        type="date"
                        value={dateRequested}
                        readOnly
                      />
                    </div>
                    <div>
                      <Label htmlFor="date-needed">Date needed</Label>
                      <Input
                        id="date-needed"
                        className="coe-input"
                        type="date"
                        min={minimumDateNeeded}
                        value={dateNeeded}
                        onChange={(event) => setDateNeeded(event.target.value)}
                        required
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Select a date at least 3 working days from today.
                      </p>
                    </div>
                  </div>
                </Section>
                <Section title="Type of copy &amp; delivery">
                  <p className="coe-section-description">
                    Choose how you&apos;d like to receive it.
                  </p>
                  <RadioGroup
                    value={copyType}
                    onValueChange={(value) => setCopyType(value as CoeCopyType)}
                    className="coe-deliveries"
                    aria-label="Type of copy and delivery"
                  >
                    {[
                      {
                        value: "original",
                        label: "Hardcopy",
                        description: "Original, pick up at HR",
                        icon: FileText,
                      },
                      {
                        value: "soft",
                        label: "Softcopy",
                        description: "Digital PDF via email",
                        icon: Mail,
                      },
                      {
                        value: "both",
                        label: "Both",
                        description: "Hardcopy + Softcopy",
                        icon: Layers,
                      },
                    ].map((option) => (
                      <div className="coe-delivery-option" key={option.value}>
                        <RadioGroupItem
                          value={option.value}
                          id={`copy-type-${option.value}`}
                          className="coe-radio-hidden"
                        />
                        <Label htmlFor={`copy-type-${option.value}`} className="coe-delivery-label">
                          <span className="coe-delivery-icon">
                            <option.icon aria-hidden />
                          </span>
                          <span className="coe-delivery-copy">
                            <span className="coe-delivery-name">{option.label}</span>
                            <span className="coe-delivery-description">{option.description}</span>
                          </span>
                          {copyType === option.value && (
                            <Check className="coe-delivery-check" aria-hidden />
                          )}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </Section>
                {requestorType === "internal" ? (
                  <div className="space-y-5">
                    <Section title="Employee request details">
                      <p className="coe-section-description">
                        Your details for your own employment records.
                      </p>

                      <div className="space-y-5">
                        <div className="coe-fields coe-fields-name">
                          <div>
                            <Label htmlFor="employee-title">Title</Label>
                            <Select value={employeeTitle} onValueChange={setEmployeeTitle}>
                              <SelectTrigger id="employee-title" className="mt-1">
                                <SelectValue placeholder="Select title" />
                              </SelectTrigger>
                              <SelectContent>
                                {COE_TITLES.map((title) => (
                                  <SelectItem key={title} value={title}>
                                    {title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-3">
                            <div>
                              <Label htmlFor="employee-first-name">First name</Label>
                              <Input
                                id="employee-first-name"
                                className="mt-1"
                                value={employeeName.firstName}
                                onChange={(event) =>
                                  setEmployeeName((current) => ({
                                    ...current,
                                    firstName: event.target.value,
                                  }))
                                }
                              />
                            </div>
                            <div>
                              <Label htmlFor="employee-middle-name">Middle name</Label>
                              <Input
                                id="employee-middle-name"
                                className="mt-1"
                                value={employeeName.middleName}
                                onChange={(event) =>
                                  setEmployeeName((current) => ({
                                    ...current,
                                    middleName: event.target.value,
                                  }))
                                }
                              />
                            </div>
                            <div>
                              <Label htmlFor="employee-last-name">Last name</Label>
                              <Input
                                id="employee-last-name"
                                className="mt-1"
                                value={employeeName.lastName}
                                onChange={(event) =>
                                  setEmployeeName((current) => ({
                                    ...current,
                                    lastName: event.target.value,
                                  }))
                                }
                              />
                            </div>
                          </div>
                        </div>
                        <div className="coe-fields">
                          <div>
                            <Label htmlFor="employee-email">Official email address</Label>
                            <Input
                              id="employee-email"
                              className="mt-1"
                              value={employeeEmail}
                              onChange={(event) => setEmployeeEmail(event.target.value)}
                              type="email"
                              placeholder="name@lyceumalabang.edu.ph"
                              autoComplete="email"
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                              Must end with @lyceumalabang.edu.ph.
                            </p>
                          </div>

                          <div>
                            <Label htmlFor="employee-number">Employee ID</Label>
                            <Input
                              id="employee-number"
                              className="mt-1"
                              value={employeeNumber}
                              onChange={(event) => setEmployeeNumber(event.target.value)}
                              placeholder="Optional"
                              maxLength={40}
                            />
                          </div>
                        </div>
                        <div className="coe-fields">
                          <div>
                            <Label htmlFor="department">Department / College / Office</Label>
                            <Select
                              value={department || undefined}
                              onValueChange={(value) => {
                                setDepartment(value);
                                if (value !== "Other") setCustomDepartment("");
                              }}
                            >
                              <SelectTrigger id="department" className="mt-1">
                                <SelectValue placeholder="Select department" />
                              </SelectTrigger>
                              <SelectContent>
                                {COE_DEPARTMENTS.map((item) => (
                                  <SelectItem key={item} value={item}>
                                    {item}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {department === "Other" && (
                              <div className="mt-3">
                                <Label htmlFor="department-other">
                                  Other department / college / office
                                </Label>
                                <Input
                                  id="department-other"
                                  className="mt-1"
                                  value={customDepartment}
                                  onChange={(event) => setCustomDepartment(event.target.value)}
                                  placeholder="Please specify"
                                />
                              </div>
                            )}
                          </div>

                          <div>
                            <Label>Employment status</Label>
                            <RadioGroup
                              value={employmentStatus}
                              onValueChange={setEmploymentStatus}
                              className="mt-2 grid gap-2 sm:grid-cols-2"
                            >
                              {COE_EMPLOYMENT_STATUSES.map((status, index) => (
                                <label
                                  key={status}
                                  htmlFor={`employment-status-${index}`}
                                  className="flex cursor-pointer items-start gap-2.5 rounded-md border bg-background px-3 py-2.5 text-sm transition-colors hover:border-primary/60 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                                >
                                  <RadioGroupItem
                                    value={status}
                                    id={`employment-status-${index}`}
                                    className="mt-0.5"
                                  />
                                  <span className="leading-snug">{status}</span>
                                </label>
                              ))}
                            </RadioGroup>
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="purpose">Purpose of use</Label>
                          <Textarea
                            id="purpose"
                            className="mt-1 min-h-24"
                            value={purpose}
                            onChange={(event) => setPurpose(event.target.value)}
                            placeholder="Enter the purpose of use"
                            maxLength={255}
                            required
                          />
                        </div>
                        <div className="coe-documents">
                          <h3 className="coe-documents-title">Documents needed</h3>
                          <div className="coe-document-grid">
                            {COE_DESCRIPTION_OPTIONS.map((option) => (
                              <label
                                key={option}
                                className="coe-document"
                                data-selected={descriptionOptions.includes(option)}
                              >
                                <Checkbox
                                  checked={descriptionOptions.includes(option)}
                                  onCheckedChange={(checked) =>
                                    setDescriptionOptions((current) =>
                                      checked
                                        ? [...current, option]
                                        : current.filter((value) => value !== option),
                                    )
                                  }
                                />
                                {COE_DESCRIPTION_TEXT_OPTIONS.has(option) ? (
                                  <span className="flex min-w-0 flex-1 items-center gap-1 text-sm">
                                    <span className="shrink-0">{option}</span>
                                    <Input
                                      aria-label={`${option} details`}
                                      className="h-8 min-w-0 flex-1"
                                      value={descriptionDetails[option] ?? ""}
                                      onChange={(event) =>
                                        setDescriptionDetails((current) => ({
                                          ...current,
                                          [option]: event.target.value,
                                        }))
                                      }
                                      placeholder="Specify"
                                      maxLength={255}
                                      disabled={!descriptionOptions.includes(option)}
                                      onClick={(event) => event.stopPropagation()}
                                    />
                                  </span>
                                ) : (
                                  <span className="text-sm">{option}</span>
                                )}
                              </label>
                            ))}
                          </div>
                          {descriptionOptions.includes(COE_DESCRIPTION_OTHER) && (
                            <Input
                              id="custom-description"
                              className="mt-3"
                              value={customDescription}
                              onChange={(event) => setCustomDescription(event.target.value)}
                              placeholder="Specify other description"
                              maxLength={255}
                            />
                          )}
                        </div>
                        <div>
                          <Label htmlFor="note">Additional note / special instructions</Label>
                          <Textarea
                            id="note"
                            className="mt-1 min-h-28"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="e.g., Please address to BDO Bank"
                            maxLength={2000}
                          />
                        </div>
                      </div>
                    </Section>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <Section title="Third-party employment verification">
                      <p className="coe-section-description">
                        Details of the company requesting verification.
                      </p>

                      <div className="space-y-5">
                        <div className="coe-fields coe-fields-verification">
                          <div>
                            <Label htmlFor="verifier-company">Employer / Company Name</Label>
                            <Input
                              id="verifier-company"
                              className="mt-1"
                              value={verifierCompany}
                              onChange={(event) => setVerifierCompany(event.target.value)}
                              placeholder="e.g., Accenture HR"
                            />
                          </div>
                          <div>
                            <Label htmlFor="verifier-name">Authorized representative name</Label>
                            <Input
                              id="verifier-name"
                              className="mt-1"
                              value={verifierName}
                              onChange={(event) => setVerifierName(event.target.value)}
                            />
                          </div>
                        </div>

                        <div className="coe-fields coe-fields-verification">
                          <div>
                            <Label htmlFor="verifier-email">Company Email / Work Email</Label>
                            <Input
                              id="verifier-email"
                              className="mt-1"
                              value={verifierEmail}
                              onChange={(event) => setVerifierEmail(event.target.value)}
                              type="email"
                            />
                          </div>
                          <div>
                            <Label htmlFor="verifier-contact">Contact number</Label>
                            <Input
                              id="verifier-contact"
                              className="mt-1"
                              type="tel"
                              inputMode="tel"
                              autoComplete="tel"
                              placeholder="Enter your phone number"
                              maxLength={24}
                              value={verifierContact}
                              onChange={(event) => setVerifierContact(event.target.value)}
                              aria-describedby="verifier-contact-help"
                            />
                            <p
                              id="verifier-contact-help"
                              className="mt-1 text-xs text-muted-foreground"
                            >
                              (e.g., 0921..)
                            </p>
                          </div>
                        </div>

                        <div className="coe-fields coe-fields-verification">
                          <div>
                            <Label htmlFor="subject-title">Prefix</Label>
                            <Select value={subjectTitle} onValueChange={setSubjectTitle}>
                              <SelectTrigger id="subject-title" className="mt-1">
                                <SelectValue placeholder="Select title" />
                              </SelectTrigger>
                              <SelectContent>
                                {COE_TITLES.map((title) => (
                                  <SelectItem key={title} value={title}>
                                    {title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor="subject-name">Employee Name or Full Name</Label>
                            <Input
                              id="subject-name"
                              className="mt-1"
                              value={subjectName}
                              onChange={(event) => setSubjectName(event.target.value)}
                            />
                          </div>
                          <div>
                            <Label htmlFor="subject-dob">Date Hired</Label>
                            <Input
                              id="subject-dob"
                              className="mt-1"
                              type="date"
                              max={dateRequested}
                              value={subjectDob}
                              onChange={(event) => setSubjectDob(event.target.value)}
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="third-party-employment-end-date">
                              Last day of employment <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id="third-party-employment-end-date"
                              className="mt-1"
                              type="date"
                              min={subjectDob || undefined}
                              max={dateRequested}
                              value={employmentEndDate}
                              onChange={(event) => setEmploymentEndDate(event.target.value)}
                              disabled={!subjectDob || subjectDob > dateRequested}
                              required
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                              Set Date Hired first. Choose a date from the hiring date through
                              today.
                            </p>
                          </div>
                        </div>

                        <div className="coe-documents">
                          <h3 className="coe-documents-title">Documents needed</h3>
                          <div className="coe-document-grid">
                            {COE_DESCRIPTION_OPTIONS.map((option) => (
                              <label
                                key={option}
                                className="coe-document"
                                data-selected={descriptionOptions.includes(option)}
                              >
                                <Checkbox
                                  checked={descriptionOptions.includes(option)}
                                  onCheckedChange={(checked) =>
                                    setDescriptionOptions((current) =>
                                      checked
                                        ? [...current, option]
                                        : current.filter((value) => value !== option),
                                    )
                                  }
                                />
                                {COE_DESCRIPTION_TEXT_OPTIONS.has(option) ? (
                                  <span className="min-w-0 flex-1">
                                    <span className="text-sm">{option}</span>
                                    <Input
                                      className="mt-1 h-8"
                                      value={descriptionDetails[option] || ""}
                                      onChange={(event) =>
                                        setDescriptionDetails((current) => ({
                                          ...current,
                                          [option]: event.target.value,
                                        }))
                                      }
                                      placeholder="Specify"
                                      maxLength={255}
                                      disabled={!descriptionOptions.includes(option)}
                                      onClick={(event) => event.stopPropagation()}
                                    />
                                  </span>
                                ) : (
                                  <span className="text-sm">{option}</span>
                                )}
                              </label>
                            ))}
                          </div>
                          {descriptionOptions.includes(COE_DESCRIPTION_OTHER) && (
                            <Input
                              id="third-party-custom-description"
                              className="mt-3"
                              value={customDescription}
                              onChange={(event) => setCustomDescription(event.target.value)}
                              placeholder="Specify other description"
                              maxLength={255}
                            />
                          )}
                        </div>
                      </div>
                    </Section>
                  </div>
                )}
              </>
            )}

            {currentStep === 2 && (
              <div className="coe-review">
                <Section title="Review your request">
                  <p className="coe-section-description">
                    Review the information below before submitting. Use Back if you need to make
                    changes.
                  </p>
                  <dl className="coe-summary-grid">
                    <div>
                      <dt className="text-muted-foreground">Request type</dt>
                      <dd className="text-sm font-normal leading-relaxed">
                        {requestorType === "internal"
                          ? "Internal Employee"
                          : "Third-Party Employment Verification"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Date needed</dt>
                      <dd className="font-medium">{dateNeeded}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Date requested</dt>
                      <dd className="font-medium">{dateRequested}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Copy / delivery</dt>
                      <dd className="font-medium">{COE_COPY_TYPE_LABELS[copyType]}</dd>
                    </div>
                    {requestorType === "internal" ? (
                      <>
                        <div>
                          <dt className="text-muted-foreground">Employee</dt>
                          <dd className="font-medium">
                            {employeeTitle}. {previewEmployeeName}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Department / office</dt>
                          <dd className="font-medium">
                            {department === "Other" ? customDepartment : department}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Email</dt>
                          <dd className="break-all font-medium">{employeeEmail}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Employee ID</dt>
                          <dd className="font-medium">{employeeNumber || "Not provided"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Employment status</dt>
                          <dd className="font-medium">{employmentStatus}</dd>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <dt className="text-muted-foreground">Verifying company / agency</dt>
                          <dd className="font-medium">{verifierCompany}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Authorized representative</dt>
                          <dd className="font-medium">{verifierName}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Business email</dt>
                          <dd className="break-all font-medium">{verifierEmail}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Contact number</dt>
                          <dd className="font-medium">
                            {normalizePhilippineMobileNumber(verifierContact) || verifierContact}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Employee to verify</dt>
                          <dd className="font-medium">
                            {subjectTitle}. {subjectName}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Date hired</dt>
                          <dd className="font-medium">{subjectDob}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Last day of employment</dt>
                          <dd className="font-medium">{employmentEndDate}</dd>
                        </div>
                      </>
                    )}
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Description</dt>
                      <dd className="font-medium">
                        {descriptionOptions
                          .map(
                            (option) =>
                              `${option}${descriptionDetails[option] ? ` ${descriptionDetails[option]}` : ""}`,
                          )
                          .join(", ")}
                        {customDescription.trim() ? ` - ${customDescription.trim()}` : ""}
                      </dd>
                    </div>
                    {requestorType === "internal" && (
                      <div className="sm:col-span-2">
                        <dt className="text-muted-foreground">Purpose of use</dt>
                        <dd className="whitespace-pre-line font-medium">{purpose}</dd>
                      </div>
                    )}
                    {note.trim() && (
                      <div className="sm:col-span-2">
                        <dt className="text-muted-foreground">Additional note</dt>
                        <dd className="whitespace-pre-line font-medium">{note.trim()}</dd>
                      </div>
                    )}
                  </dl>
                </Section>

                <Section title="Final confirmation">
                  <div className="coe-confirmation">
                    <p>
                      <strong>Processing SLA Notice:</strong> Standard processing time for all
                      requests is 3 working days. You will receive an automated notification
                      once your request has been updated by HRDO.
                    </p>
                    <label className="flex items-start gap-2 rounded-md border p-3">
                      <Checkbox
                        checked={privacyChecked}
                        onCheckedChange={(checked) => setPrivacyChecked(checked === true)}
                      />
                      <span className="text-sm text-foreground">
                        I certify that all information provided is true and correct, and I consent
                        to the processing of this data for verification/certification purposes.
                      </span>
                    </label>
                  </div>
                </Section>

                <div className="coe-notice">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                  <span>
                    <strong>Important:</strong> All COE requests have a{" "}
                    <strong>standard processing time</strong>
                    of{" "}
                    <strong>
                      <span style={{ color: "#d9534f" }}>three (3) working days</span>
                    </strong>{" "}
                    (excluding weekends and holidays).
                  </span>
                </div>
              </div>
            )}

            {submit.isError && (
              <p
                role="alert"
                className="rounded-sm border border-destructive/30 bg-danger-soft p-3 text-sm"
              >
                {submit.error instanceof Error
                  ? submit.error.message
                  : "We couldn't submit your request. Please try again."}
              </p>
            )}

            <footer className="coe-footer">
              <div className="coe-footer-inner">
                <Button
                  type="button"
                  variant="outline"
                  className="coe-button coe-button-back"
                  disabled={currentStep === 0 || submit.isPending}
                  onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
                >
                  <ArrowLeft aria-hidden />
                  Back
                </Button>
                {currentStep > 0 && (
                  <span className="coe-footer-step">
                    Step {currentStep + 1} of {COE_STEPS.length}
                  </span>
                )}
                <Button
                  type="submit"
                  className="coe-button coe-button-next"
                  disabled={submit.isPending || (currentStep === 0 && !requestorType)}
                >
                  {submit.isPending ? (
                    <ButtonLoading label="Submitting…" />
                  ) : currentStep === lastStep ? (
                    "Submit COE Request"
                  ) : (
                    <>
                      Next
                      <ArrowRight aria-hidden />
                    </>
                  )}
                </Button>
              </div>
            </footer>
          </form>
        </main>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm COE Request Submission</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Are you sure you want to submit this Certificate of Employment request?
              </span>
              <span className="block rounded-md bg-amber-50 p-2 text-sm text-amber-900">
                <strong>Reminder:</strong> Submission of this request does{" "}
                <strong>not guarantee</strong>. Automatic approval.{" "}
                <strong>3 working days</strong> from submission.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submit.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSubmit} disabled={submit.isPending}>
              {submit.isPending ? <ButtonLoading label="Submitting…" /> : "Yes, Submit Request"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
