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
import { Section } from "@/components/app/PageHeader";
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
  COE_PURPOSE_OPTIONS,
  COE_PURPOSE_OTHER,
  COE_TITLES,
  formatStoredDescription,
} from "@/lib/coe-form";

const COE_STEPS = [
  {
    key: "type",
    title: "Request Type",
    blurb: "Choose whether this is your own certificate or a verification for another employer.",
  },
  {
    key: "copy",
    title: "Type of Copy",
    blurb: "Choose how you would like to receive the certificate.",
  },
  {
    key: "details",
    title: "Details",
    blurb: "Provide the schedule and information HRDO needs to prepare the certificate.",
  },
  {
    key: "purpose",
    title: "Purpose",
    blurb: "Tell us how the certificate or verification will be used.",
  },
  {
    key: "documents",
    title: "Documents",
    blurb: "Select the document details that should appear on the certificate.",
  },
  {
    key: "review",
    title: "Review",
    blurb: "Read each line. Use Back if something is wrong.",
  },
] as const;

type CoeSearch = {
  requestor?: "internal" | "third_party";
};

const COE_DESCRIPTION_HINTS: Record<(typeof COE_DESCRIPTION_OPTIONS)[number], string> = {
  "Certificate of Employment": "Standard proof of current or past employment.",
  "Letter of": "Add the specific letter or request name.",
  "Affidavit of": "Add the subject of the affidavit.",
  "With compensation review": "Include compensation details for review.",
  "Service Record": "Include the employee service history.",
  "Form of": "Add the name of the required form.",
  Others: "Include another document detail not listed above.",
};

const PHILIPPINE_TIME_ZONE = "Asia/Manila";

function localDateValue(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PHILIPPINE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatPhilippineDate(value: string) {
  if (!value) return "Not provided";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function addWorkingDays(start: Date, count: number) {
  const startParts = new Intl.DateTimeFormat("en-US", {
    timeZone: PHILIPPINE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(start);
  const values = Object.fromEntries(startParts.map(({ type, value }) => [type, value]));
  const date = new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)),
  );
  let remaining = count;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/hrdo/coe")({
  validateSearch: (search: Record<string, unknown>): CoeSearch => {
    const requestor = search["requestor"];
    return requestor === "internal" || requestor === "third_party" ? { requestor } : {};
  },
  beforeLoad: ({ context }) => {
    if (context.hrdoViewer?.role === "hrdo_staff" || context.hrdoViewer?.role === "hrdo_admin") {
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
  const search = Route.useSearch();
  const { hrdoViewer } = Route.useRouteContext();
  const viewerEmail = hrdoViewer?.email ?? "";
  const requestor =
    search.requestor === "internal" || search.requestor === "third_party" ? search.requestor : null;
  const typeLocked = Boolean(hrdoViewer);
  const initialRequestor = hrdoViewer?.isExternal
    ? "third_party"
    : (requestor ?? "internal");
  const queryClient = useQueryClient();
  const [requestorType, setRequestorType] = useState<"internal" | "third_party" | null>(
    initialRequestor,
  );
  const [purpose, setPurpose] = useState("");
  const [customPurpose, setCustomPurpose] = useState("");
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
  const [copyTypeSelected, setCopyTypeSelected] = useState(false);
  const [verifierCompany, setVerifierCompany] = useState("");
  const [verifierName, setVerifierName] = useState("");
  const [verifierEmail, setVerifierEmail] = useState("");
  const [verifierContact, setVerifierContact] = useState("");
  const [subjectFirstName, setSubjectFirstName] = useState("");
  const [subjectMiddleName, setSubjectMiddleName] = useState("");
  const [subjectLastName, setSubjectLastName] = useState("");
  const [subjectPosition, setSubjectPosition] = useState("");
  const [subjectDob, setSubjectDob] = useState("");
  const [employmentEndDate, setEmploymentEndDate] = useState("");
  const [currentlyEmployed, setCurrentlyEmployed] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentStep, setCurrentStep] = useState(typeLocked ? 1 : 0);
  const [submissionSummary, setSubmissionSummary] = useState<{
    email: string;
    copyType: CoeCopyType;
  } | null>(null);

  const dateRequested = localDateValue(new Date());
  const minimumDateNeeded = addWorkingDays(new Date(), 3);
  const previewEmployeeName = joinFullName(employeeName);
  const subjectName = [subjectFirstName, subjectMiddleName, subjectLastName]
    .map((name) => name.trim())
    .filter(Boolean)
    .join(" ");
  const selectedPurpose = purpose === COE_PURPOSE_OTHER ? customPurpose : purpose;

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
              `Purpose of verification: ${purpose.trim()}`,
              `Subject position: ${subjectPosition}`,
              `Verifier company: ${verifierCompany || "Not provided"}`,
              `Authorized representative: ${verifierName || "Not provided"}`,
              `Contact number: ${normalizedVerifierContact || "Not provided"}`,
              `Employee to verify: ${subjectName || "Not provided"}`,
              `Date hired: ${subjectDob || "Not provided"}`,
              `Employment end date: ${currentlyEmployed ? "Present" : employmentEndDate || "Not provided"}`,
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
            requestorType,
            purpose:
              requestorType === "third_party"
                ? "Third-party verification / employment verification"
                : selectedPurpose.trim(),
            note: combinedNote,
            employeeEmail:
              requestorType === "third_party" ? verifierEmail.trim() : employeeEmail.trim(),
            employeeNumber: employeeNumber.trim(),
            contactNumber: requestorType === "third_party" ? normalizedVerifierContact : "",
            employeeName:
              requestorType === "third_party" ? subjectName : joinFullName(employeeName),
            department: submittedDepartment,
            copyType,
          },
        }),
      );
    },
    onSuccess: async () => {
      setPurpose("");
      setCustomPurpose("");
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
      setCopyTypeSelected(false);
      setVerifierCompany("");
      setVerifierName("");
      setVerifierEmail("");
      setVerifierContact("");
      setSubjectFirstName("");
      setSubjectMiddleName("");
      setSubjectLastName("");
      setSubjectPosition("");
      setSubjectDob("");
      setEmploymentEndDate("");
      setCurrentlyEmployed(false);
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
                You will receive an email when your hardcopy is ready for pickup at{" "}
                <strong>HUMAN RESOURCE DEVELOPMENT OFFICE.</strong>
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
    if (key === "copy" && !copyTypeSelected) {
      return "Choose a copy type to continue.";
    }
    if (key === "details") {
      if (!dateNeeded || dateNeeded < minimumDateNeeded) {
        return "Choose a date needed at least 3 working days from today.";
      }
      if (requestorType === "internal") {
        if (!employeeTitle) return "Select a title.";
        if (employeeName.firstName.trim().length < 2) return "Enter your first name.";
        if (employeeName.lastName.trim().length < 2) return "Enter your last name.";
        if (
          !employeeEmail.trim() ||
          (hrdoViewer?.isExternal
            ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employeeEmail.trim())
            : !/^[^\s@]+@lyceumalabang\.edu\.ph$/i.test(employeeEmail.trim()))
        ) {
          return hrdoViewer?.isExternal
            ? "Enter a valid personal email address."
            : "Use your official email: name@lyceumalabang.edu.ph";
        }
        if (employeeNumber.trim() && employeeNumber.trim().length < 3) {
          return "Employee ID must be 3 or more characters if provided.";
        }
        const departmentName = department === "Other" ? customDepartment.trim() : department.trim();
        if (!departmentName) return "Choose your department or office, or specify Other.";
        if (!employmentStatus) return "Select your employment status.";
      }
      if (requestorType === "third_party") {
        if (!verifierCompany.trim()) return "Enter the verifying company or agency name.";
        if (!verifierName.trim()) return "Enter the authorized representative name.";
        if (!verifierEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verifierEmail)) {
          return "Enter a valid email address. A school email is not required for third-party verification.";
        }
        if (!normalizePhilippineMobileNumber(verifierContact)) {
          return "Enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).";
        }
        if (!subjectFirstName.trim()) return "Enter the former employee's first name.";
        if (!subjectLastName.trim()) return "Enter the former employee's last name.";
        if (!subjectPosition.trim()) return "Enter the former employee's job title or position.";
        if (!subjectDob) return "Enter the hiring date.";
        if (subjectDob > dateRequested) return "Date hired cannot be in the future.";
        if (!currentlyEmployed && !employmentEndDate) return "Enter the last day of employment or select Currently employed.";
        if (!currentlyEmployed && employmentEndDate < subjectDob) {
          return "Last day of employment must be on or after the hiring date.";
        }
        if (!currentlyEmployed && employmentEndDate > dateRequested) {
          return "Last day of employment cannot be in the future.";
        }
      }
    }
    if (key === "purpose" && selectedPurpose.trim().length < 5) {
      return requestorType === "third_party"
        ? "Enter the purpose of this employment verification."
        : "Enter the purpose of use.";
    }
    if (key === "documents") {
      const descriptionError = missingDescription();
      if (descriptionError) return descriptionError;
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
          <div className="coe-form-intro">
            <div className="coe-form-logos" aria-label="Lyceum of Alabang and HRDO">
              <img src="/loa-logo.png" alt="Lyceum of Alabang logo" />
              <img src="/HRDO%20LOGO.png" alt="Human Resources Development Office logo" />
            </div>
            <h1>Certificate of Employment</h1>
            <p>{currentBatch.blurb}</p>
          </div>
          <ol className="coe-steps" aria-label="Request progress">
            {COE_STEPS.map((step, index) => {
              const isLockedType = typeLocked && index === 0;
              const state =
                isLockedType || index < currentStep
                  ? "done"
                  : index === currentStep
                    ? "active"
                    : "upcoming";
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
              <Section title="Type of copy & delivery">
                <p className="coe-section-description">
                  Choose how you&apos;d like to receive your certificate.
                </p>
                <RadioGroup
                  value={copyType}
                  onValueChange={(value) => {
                    setCopyType(value as CoeCopyType);
                    setCopyTypeSelected(true);
                  }}
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
                      description: "Send PDF via email",
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
            )}

            {currentStep === 2 && (
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
                {requestorType === "internal" ? (
                  <div className="space-y-4">
                    <Section title="Employee request details">
                      <p className="coe-section-description">
                        Your details for your own employment records.
                      </p>

                      <div className="space-y-4">
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
                              value={department}
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
                      </div>
                    </Section>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Section title="Third-party employment verification">
                      <div className="space-y-3">
                        <div className="coe-subsection">
                          <div className="coe-subsection-heading">
                            <h3>Employee information</h3>
                            <p>Details of the employee whose employment is being verified.</p>
                          </div>
                          <div className="coe-fields coe-fields-verification">
                            <div>
                              <Label htmlFor="subject-first-name">
                                First Name <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="subject-first-name"
                                className="mt-1"
                                placeholder="Enter first name"
                                value={subjectFirstName}
                                onChange={(event) => setSubjectFirstName(event.target.value)}
                                autoComplete="given-name"
                              />
                            </div>
                            <div>
                              <Label htmlFor="subject-middle-name">Middle Name</Label>
                              <Input
                                id="subject-middle-name"
                                className="mt-1"
                                placeholder="Optional"
                                value={subjectMiddleName}
                                onChange={(event) => setSubjectMiddleName(event.target.value)}
                                autoComplete="additional-name"
                              />
                            </div>
                            <div>
                              <Label htmlFor="subject-last-name">
                                Last Name <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="subject-last-name"
                                className="mt-1"
                                placeholder="Enter last name"
                                value={subjectLastName}
                                onChange={(event) => setSubjectLastName(event.target.value)}
                                autoComplete="family-name"
                              />
                            </div>
                          </div>
                          <div className="coe-fields coe-fields-verification">
                            <div>
                              <Label htmlFor="subject-position">
                                Job Title / Position <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="subject-position"
                                className="mt-1"
                                placeholder="e.g., Software Engineer"
                                value={subjectPosition}
                                onChange={(event) => setSubjectPosition(event.target.value)}
                              />
                            </div>
                            <div>
                              <Label htmlFor="subject-dob">
                                Date Hired <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="subject-dob"
                                className="mt-1"
                                type="date"
                                max={dateRequested}
                                value={subjectDob}
                                onChange={(event) => setSubjectDob(event.target.value)}
                                required
                              />
                              <p className="mt-1 text-xs text-muted-foreground">DD/MM/YYYY</p>
                            </div>
                            <div>
                              <Label htmlFor="third-party-employment-end-date">
                                Last Day of Employment
                                {!currentlyEmployed && <span className="text-destructive"> *</span>}
                              </Label>
                              <Input
                                id="third-party-employment-end-date"
                                className="mt-1"
                                type="date"
                                min={subjectDob || undefined}
                                max={dateRequested}
                                value={employmentEndDate}
                                onChange={(event) => setEmploymentEndDate(event.target.value)}
                                disabled={currentlyEmployed || !subjectDob || subjectDob > dateRequested}
                                required={!currentlyEmployed}
                              />
                              <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                <Checkbox
                                  checked={currentlyEmployed}
                                  onCheckedChange={(checked) => {
                                    const isChecked = checked === true;
                                    setCurrentlyEmployed(isChecked);
                                    if (isChecked) setEmploymentEndDate("");
                                  }}
                                />
                                Currently employed
                              </label>
                            </div>
                          </div>
                        </div>

                        <div className="coe-subsection">
                          <div className="coe-subsection-heading">
                            <h3>Third-party requester information</h3>
                            <p>
                              Details of the company and authorized representative requesting
                              verification.
                            </p>
                          </div>
                          <div className="coe-fields coe-fields-verification coe-fields-verification-pair">
                            <div>
                              <Label htmlFor="verifier-company">
                                Requesting Company / Agency Name <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="verifier-company"
                                className="mt-1"
                                value={verifierCompany}
                                onChange={(event) => setVerifierCompany(event.target.value)}
                                placeholder="e.g., Accenture HR"
                              />
                            </div>
                            <div>
                              <Label htmlFor="verifier-name">
                                Authorized Representative Name <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="verifier-name"
                                className="mt-1"
                                value={verifierName}
                                onChange={(event) => setVerifierName(event.target.value)}
                              />
                            </div>
                          </div>

                          <div className="coe-fields coe-fields-verification coe-fields-verification-pair">
                            <div>
                              <Label htmlFor="verifier-email">
                                Official Business Email <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="verifier-email"
                                className="mt-1"
                                value={verifierEmail}
                                onChange={(event) => setVerifierEmail(event.target.value)}
                                type="email"
                                autoComplete="email"
                                placeholder="company or personal email"
                              />
                            </div>
                            <div>
                              <Label htmlFor="verifier-contact">
                                Contact Number <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="verifier-contact"
                                className="mt-1"
                                type="tel"
                                inputMode="tel"
                                autoComplete="tel"
                                placeholder="09XXXXXXXXX"
                                maxLength={24}
                                value={verifierContact}
                                onChange={(event) => setVerifierContact(event.target.value)}
                                aria-describedby="verifier-contact-help"
                              />
                              <p
                                id="verifier-contact-help"
                                className="mt-1 text-xs text-muted-foreground"
                              >
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Section>
                  </div>
                )}
              </>
            )}

            {currentStep === 3 && (
              <Section
                title={
                  requestorType === "third_party" ? "Purpose of verification" : "Purpose of use"
                }
              >
                <p className="coe-section-description">
                  {requestorType === "third_party"
                    ? "Tell us why this employment verification is needed."
                    : "Tell us where or why you need this certificate."}
                </p>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="purpose">
                      {requestorType === "third_party"
                        ? "Purpose of verification"
                        : "Purpose of use"}
                    </Label>
                    {requestorType === "third_party" ? (
                      <Textarea
                        id="purpose"
                        className="mt-1 min-h-24"
                        value={purpose}
                        onChange={(event) => setPurpose(event.target.value)}
                        maxLength={255}
                        required
                      />
                    ) : (
                      <>
                        <Select
                          value={purpose}
                          onValueChange={(value) => {
                            setPurpose(value);
                            if (value !== COE_PURPOSE_OTHER) setCustomPurpose("");
                          }}
                        >
                          <SelectTrigger id="purpose" className="mt-1">
                            <SelectValue placeholder="Select the purpose of use" />
                          </SelectTrigger>
                          <SelectContent>
                            {COE_PURPOSE_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {purpose === COE_PURPOSE_OTHER && (
                          <div className="mt-3">
                            <Label htmlFor="custom-purpose">Specify the purpose</Label>
                            <Input
                              id="custom-purpose"
                              className="mt-1"
                              value={customPurpose}
                              onChange={(event) => setCustomPurpose(event.target.value)}
                              placeholder="Specify the purpose of use"
                              maxLength={255}
                              required
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="note">Additional note / special instructions (optional)</Label>
                    <Textarea
                      id="note"
                      className="mt-1 min-h-20"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Add any instructions HRDO should know"
                      maxLength={2000}
                    />
                  </div>
                </div>
              </Section>
            )}

            {currentStep === 4 && (
              <Section title="Documents needed">
                <p className="coe-section-description">
                  Select the information to include in the certificate. Choose at least one option.
                </p>
                <div className="coe-documents">
                  <div className="coe-document-grid">
                    {COE_DESCRIPTION_OPTIONS.map((option, index) => {
                      const selected = descriptionOptions.includes(option);
                      const optionId = `coe-document-${index}`;
                      const detailId = `${optionId}-details`;
                      return (
                        <div key={option} className="coe-document" data-selected={selected}>
                          <Checkbox
                            id={optionId}
                            checked={descriptionOptions.includes(option)}
                            onCheckedChange={(checked) =>
                              setDescriptionOptions((current) =>
                                checked
                                  ? [...current, option]
                                  : current.filter((value) => value !== option),
                              )
                            }
                          />
                          <div className="coe-document-copy">
                            <label className="coe-document-label" htmlFor={optionId}>
                              {option}
                            </label>
                            <span className="coe-document-hint">
                              {COE_DESCRIPTION_HINTS[option]}
                            </span>
                            {COE_DESCRIPTION_TEXT_OPTIONS.has(option) && (
                              <div className="coe-document-detail">
                                <label htmlFor={detailId}>Details for {option}</label>
                                <Input
                                  id={detailId}
                                  value={descriptionDetails[option] ?? ""}
                                  onChange={(event) =>
                                    setDescriptionDetails((current) => ({
                                      ...current,
                                      [option]: event.target.value,
                                    }))
                                  }
                                  placeholder="Enter details"
                                  maxLength={255}
                                  disabled={!selected}
                                />
                              </div>
                            )}
                            {option === COE_DESCRIPTION_OTHER && (
                              <div className="coe-document-detail">
                                <label htmlFor="custom-description">Other document details</label>
                                <Input
                                  id="custom-description"
                                  value={customDescription}
                                  onChange={(event) => setCustomDescription(event.target.value)}
                                  placeholder="Enter details"
                                  maxLength={255}
                                  disabled={!selected}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Section>
            )}

            {currentStep === 5 && (
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
                    <dd className="font-medium">{formatPhilippineDate(dateNeeded)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Date requested</dt>
                    <dd className="font-medium">{formatPhilippineDate(dateRequested)}</dd>
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
                            {subjectName} · {subjectPosition}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Date hired</dt>
                          <dd className="font-medium">{formatPhilippineDate(subjectDob)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Last day of employment</dt>
                          <dd className="font-medium">
                            {currentlyEmployed
                              ? "Currently employed"
                              : formatPhilippineDate(employmentEndDate)}
                          </dd>
                        </div>
                      </>
                    )}
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Documents needed</dt>
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
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">
                        {requestorType === "third_party"
                          ? "Purpose of verification"
                          : "Purpose of use"}
                      </dt>
                      <dd className="whitespace-pre-line font-medium">{selectedPurpose}</dd>
                    </div>
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
                      requests is 3 working days. You will receive an automated notification once
                      your request has been updated by HRDO.
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
                  disabled={
                    currentStep === 0 || (typeLocked && currentStep === 1) || submit.isPending
                  }
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
                  disabled={
                    submit.isPending ||
                    (currentStep === 0 && !requestorType) ||
                    (currentStep === 1 && !copyTypeSelected)
                  }
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
                <strong>not guarantee</strong>. Automatic approval. <strong>3 working days</strong>{" "}
                from submission.
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
