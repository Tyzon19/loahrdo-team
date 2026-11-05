import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
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
import { PageHeader } from "@/components/app/PageHeader";
import { ButtonLoading } from "@/components/app/LoadingPanel";
import { submitCoeRequestFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
import { joinFullName } from "@/lib/name";
import { normalizePhilippineMobileNumber } from "@/lib/validation";
import { COE_COPY_TYPE_LABELS, type CoeCopyType } from "@/lib/hrdo";
import { SITE } from "@/lib/site";

const DESCRIPTION_OTHER = "Others";
const DESCRIPTION_OPTIONS = [
  "Certificate of Employment",
  "Letter of",
  "Affidavit of",
  "With compensation review",
  "Service Record",
  "Form of",
  DESCRIPTION_OTHER,
] as const;
const DESCRIPTION_TEXT_OPTIONS = new Set(["Letter of", "Affidavit of", "Form of"]);
const STEP_LABELS = ["Request type", "Request details", "Review & submit"] as const;

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
      { title: `COE Request — ${SITE.name}` },
      { name: "description", content: "Submit and track a Certificate of Employment request." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CoeRequestPage,
});

function CoeRequestPage() {
  const { hrdoViewer } = Route.useRouteContext();
  const viewerEmail = hrdoViewer?.email ?? "";
  const navigate = useNavigate();
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
              `Description: ${
                descriptionOptions
                  .map(
                    (option) =>
                      `${option}${descriptionDetails[option] ? ` ${descriptionDetails[option]}` : ""}`,
                  )
                  .join(", ") || "Not provided"
              }${customDescription.trim() ? ` - ${customDescription.trim()}` : ""}`,
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
              `Description: ${
                descriptionOptions
                  .map(
                    (option) =>
                      `${option}${descriptionDetails[option] ? ` ${descriptionDetails[option]}` : ""}`,
                  )
                  .join(", ") || "Not provided"
              }${customDescription.trim() ? ` - ${customDescription.trim()}` : ""}`,
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
    onSuccess: async (created) => {
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
      toast.success(
        "Request submitted successfully. Your COE request is now under review and will be processed within 3 working days. It is not automatically approved.",
        { duration: 6000 },
      );
      await queryClient.invalidateQueries({ queryKey: ["coe"] });
      await navigate({ to: "/hrdo/coe/$id", params: { id: created.id } });
    },
  });

  if (!hrdoViewer) return null;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (currentStep === 0) {
      if (!requestorType) {
        toast.error("Choose Employee Request or Third-Party Employment Verification.");
        return;
      }
      setCurrentStep(1);
      return;
    }

    const fullEmployeeName = joinFullName(employeeName);
    const trimmedEmployeeEmail = employeeEmail.trim();
    const trimmedEmployeeNumber = employeeNumber.trim();
    const trimmedPurpose = purpose.trim();
    if (!dateNeeded || dateNeeded < minimumDateNeeded) {
      toast.error("Choose a date needed at least 3 working days from today.");
      return;
    }

    if (requestorType === "internal") {
      if (!employeeTitle) {
        toast.error("Select a title for the employee.");
        return;
      }
      if (employeeName.firstName.trim().length < 2) {
        toast.error("Enter your first name.");
        return;
      }
      if (employeeName.lastName.trim().length < 2) {
        toast.error("Enter last name.");
        return;
      }
      if (
        !trimmedEmployeeEmail ||
        !/^[^\s@]+@lyceumalabang\.edu\.ph$/i.test(trimmedEmployeeEmail)
      ) {
        toast.error("Use your official institutional email: name@lyceumalabang.edu.ph");
        return;
      }
      if (trimmedEmployeeNumber && trimmedEmployeeNumber.length < 3) {
        toast.error("Employee ID must be 3 or more characters if provided.");
        return;
      }
      const departmentName = department === "Other" ? customDepartment.trim() : department.trim();
      if (!departmentName) {
        toast.error("Choose your department or office, or specify Other.");
        return;
      }
      if (!employmentStatus) {
        toast.error("Select your employment status.");
        return;
      }
      if (!trimmedPurpose || trimmedPurpose.length < 5) {
        toast.error("Enter the purpose of use.");
        return;
      }
      if (!descriptionOptions.length) {
        toast.error("Select at least one description.");
        return;
      }
      if (descriptionOptions.includes(DESCRIPTION_OTHER) && !customDescription.trim()) {
        toast.error("Specify the other description.");
        return;
      }
      const missingDescriptionDetail = descriptionOptions.find(
        (option) => DESCRIPTION_TEXT_OPTIONS.has(option) && !descriptionDetails[option]?.trim(),
      );
      if (missingDescriptionDetail) {
        toast.error(`Complete the "${missingDescriptionDetail}" field.`);
        return;
      }
    } else {
      if (!verifierCompany.trim()) {
        toast.error("Enter the verifying company or agency name.");
        return;
      }
      if (!verifierName.trim()) {
        toast.error("Enter the authorized representative name.");
        return;
      }
      if (!verifierEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verifierEmail)) {
        toast.error("Enter a valid company email / work email.");
        return;
      }
      if (!normalizePhilippineMobileNumber(verifierContact)) {
        toast.error("Enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).");
        return;
      }
      if (!subjectName.trim()) {
        toast.error("Enter the employee name or full name.");
        return;
      }
      if (!subjectTitle) {
        toast.error("Select a title for the employee to verify.");
        return;
      }
      if (!subjectDob) {
        toast.error("Enter the employee hiring date.");
        return;
      }
      if (!employmentEndDate) {
        toast.error("Enter the former employee's last day of employment.");
        return;
      }
      if (employmentEndDate < subjectDob) {
        toast.error("Employment end date must be on or after the hiring date.");
        return;
      }
      if (employmentEndDate > dateRequested) {
        toast.error("Employment end date cannot be in the future.");
        return;
      }
      if (!descriptionOptions.length) {
        toast.error("Select at least one description.");
        return;
      }
      if (descriptionOptions.includes(DESCRIPTION_OTHER) && !customDescription.trim()) {
        toast.error("Specify the other description.");
        return;
      }
      const missingDescriptionDetail = descriptionOptions.find(
        (option) => DESCRIPTION_TEXT_OPTIONS.has(option) && !descriptionDetails[option]?.trim(),
      );
      if (missingDescriptionDetail) {
        toast.error(`Complete the "${missingDescriptionDetail}" field.`);
        return;
      }
    }

    if (currentStep === 1) {
      setCurrentStep(2);
      return;
    }

    if (!privacyChecked) {
      toast.error("Please agree to the data privacy statement before submitting.");
      return;
    }

    if (requestorType === "internal" && fullEmployeeName.length < 5) {
      toast.error("Enter employee name.");
      return;
    }

    setShowConfirm(true);
  }

  function confirmSubmit() {
    setShowConfirm(false);
    submit.mutate();
  }

  return (
    <>
      <PageHeader
        title="Certificate of Employment (COE) & Verification Form"
        description="Submit a request for employment verification or certification."
      />

      <div className="coe-request">
        <header className="coe-header">
          <div className="coe-header-inner">
            <p className="coe-eyebrow">HR Services</p>
            <h1 className="coe-title">COE Request</h1>
            {currentStep > 0 && (
              <ol className="coe-steps" aria-label="Request progress">
                {STEP_LABELS.map((label, step) => {
                  const state =
                    step < currentStep ? "done" : step === currentStep ? "active" : "pending";
                  return (
                    <li
                      key={label}
                      className="coe-step"
                      data-state={state}
                      aria-current={step === currentStep ? "step" : undefined}
                    >
                      <div className="coe-step-content">
                        <span className="coe-step-circle">
                          {step < currentStep ? <Check aria-hidden /> : step + 1}
                        </span>
                        <span className="coe-step-name">{label}</span>
                      </div>
                      {step < STEP_LABELS.length - 1 && <span className="coe-step-line" />}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </header>

        <main className="coe-main">
          <form className="coe-form" onSubmit={onSubmit} noValidate>
            {currentStep === 0 && (
              <section className="coe-section">
                <h2 className="coe-section-title">What type of request are you making?</h2>
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
                      <span className="block font-medium">Employee Request</span>
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
              </section>
            )}

            {currentStep === 1 && (
              <>
                <section className="coe-section">
                  <h2 className="coe-section-title">Request schedule</h2>
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
                </section>
                <section className="coe-section">
                  <h2 className="coe-section-title">Type of copy &amp; delivery</h2>
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
                </section>
                {requestorType === "internal" ? (
                  <div className="space-y-5">
                    <section className="coe-section">
                      <h2 className="coe-section-title">Employee request details</h2>
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
                                {["Mr", "Ms", "Mrs", "Dr", "Atty", "Engr", "Prof", "Mx"].map(
                                  (title) => (
                                    <SelectItem key={title} value={title}>
                                      {title}
                                    </SelectItem>
                                  ),
                                )}
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
                                {[
                                  "Admission Office",
                                  "College of Law",
                                  "Basic Education Library",
                                  "Customs Administration",
                                  "Bookstore",
                                  "Center forCreer and Alumni Services",
                                  "CCS",
                                  "CCTV Office",
                                  "Clinic",
                                  "College Library & SHS Library",
                                  "Finance",
                                  "General Education & COED",
                                  "LOA Care Center (Guidance & Testing)",
                                  "HRM - CTHM Faculty",
                                  "HRM - Stockroom / TESDA Custodian",
                                  "Human Resource Dept.",
                                  "Inches & Pixels",
                                  "Quality Assurance Office",
                                  "ITM",
                                  "VCAT / Monitoring Office",
                                  "Office of Academic Affairs",
                                  "Office of Studies Affairs & Services",
                                  "Prefect Discipline Office (beD)",
                                  "PFMO",
                                  "Principal's Office DepEd",
                                  "Purchasing Office",
                                  "Property Office",
                                  "Registrar",
                                  "REM Department",
                                  "CRID (Research Department)",
                                  "Security",
                                  "Sounds and Lights DVA Gym",
                                  "Tesda - Assesment",
                                  "Technology Department (TESDA",
                                  "Warehouse",
                                  "Office of the President",
                                  "Senior Highschool Faculty",
                                ].map((item) => (
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
                              {[
                                "Full-time / Regular",
                                "Part-time",
                                "Probationary",
                                "Contractual / Contract of Service",
                              ].map((status, index) => (
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
                            {DESCRIPTION_OPTIONS.map((option) => (
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
                                {DESCRIPTION_TEXT_OPTIONS.has(option) ? (
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
                          {descriptionOptions.includes(DESCRIPTION_OTHER) && (
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
                    </section>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <section className="coe-section">
                      <h2 className="coe-section-title">Third-party employment verification</h2>
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
                                {["Mr", "Ms", "Mrs", "Dr", "Atty", "Engr", "Prof", "Mx"].map(
                                  (title) => (
                                    <SelectItem key={title} value={title}>
                                      {title}
                                    </SelectItem>
                                  ),
                                )}
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
                              value={subjectDob}
                              onChange={(event) => setSubjectDob(event.target.value)}
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
                              required
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                              Required for verification of a former employee.
                            </p>
                          </div>
                        </div>

                        <div className="coe-documents">
                          <h3 className="coe-documents-title">Documents needed</h3>
                          <div className="coe-document-grid">
                            {DESCRIPTION_OPTIONS.map((option) => (
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
                                {DESCRIPTION_TEXT_OPTIONS.has(option) ? (
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
                          {descriptionOptions.includes(DESCRIPTION_OTHER) && (
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
                    </section>
                  </div>
                )}
              </>
            )}

            {currentStep === 2 && (
              <div className="coe-review">
                <section className="coe-section coe-summary">
                  <h2 className="coe-section-title">Review your request</h2>
                  <p className="coe-section-description">
                    Review the information below before submitting. Use Back if you need to make
                    changes.
                  </p>
                  <dl className="coe-summary-grid">
                    <div>
                      <dt className="text-muted-foreground">Request type</dt>
                      <dd className="font-medium">
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
                        {customDescription.trim() ? ` — ${customDescription.trim()}` : ""}
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
                </section>

                <section className="coe-section">
                  <h2 className="coe-section-title">Final confirmation</h2>
                  <div className="coe-confirmation">
                    <p>
                      <strong>Processing SLA Notice:</strong> Standard processing time for all
                      requests is 3 to 5 working days. You will receive an automated notification
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
                </section>

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
                  <span className="coe-footer-step">Step {currentStep + 1} of 3</span>
                )}
                <Button
                  type="submit"
                  className="coe-button coe-button-next"
                  disabled={submit.isPending || (currentStep === 0 && !requestorType)}
                >
                  {submit.isPending ? (
                    <ButtonLoading label="Submitting…" />
                  ) : currentStep === 2 ? (
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
                <strong>Reminder:</strong> This request is{" "}
                <strong>not automatically granted</strong>. HRDO will review and process it within{" "}
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
