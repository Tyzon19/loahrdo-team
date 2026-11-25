import { COE_COPY_TYPE_LABELS, type CoeCopyType } from "@/lib/hrdo";

export const COE_DESCRIPTION_OTHER = "Others";

export const COE_DESCRIPTION_OPTIONS = [
  "Certificate of Employment",
  "Letter of",
  "Affidavit of",
  "With compensation review",
  "Service Record",
  "Form of",
  COE_DESCRIPTION_OTHER,
] as const;

export const COE_DESCRIPTION_TEXT_OPTIONS = new Set(["Letter of", "Affidavit of", "Form of"]);

export const COE_PURPOSE_OTHER = "Other";

export const COE_PURPOSE_OPTIONS = [
  "Job Applications",
  "Loan and Credit Applications",
  "Visa and Immigration Requirements",
  "Government Transaction",
  "Rental Lease Agreements",
  COE_PURPOSE_OTHER,
] as const;

export const COE_TITLES = ["Mr", "Ms", "Mrs", "Dr", "Atty", "Engr", "Prof", "Mx"] as const;

export const COE_EMPLOYMENT_STATUSES = [
  "Full-time / Regular",
  "Part-time",
  "Probationary",
  "Contractual / Contract of Service",
] as const;

export const COE_DEPARTMENTS = [
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
  "Other",
] as const;

export const COE_COPY_CHOICES: Array<{
  value: CoeCopyType;
  label: string;
  hint: string;
}> = [
  {
    value: "original",
    label: COE_COPY_TYPE_LABELS.original,
    hint: "Printed original. Claim it at the HRDO desk.",
  },
  {
    value: "soft",
    label: COE_COPY_TYPE_LABELS.soft,
    hint: "Signed PDF sent to the email on this request.",
  },
  {
    value: "both",
    label: COE_COPY_TYPE_LABELS.both,
    hint: "Pickup at HRDO, plus a signed PDF by email.",
  },
];

export type CoeFormBatch = {
  key: string;
  title: string;
  blurb: string;
};

export function coeRequestBatches(type: "internal" | "third_party" | null): CoeFormBatch[] {
  if (type === "third_party") {
    return [
      { key: "type", title: "Request type", blurb: "Who is asking HRDO for this certificate?" },
      {
        key: "org",
        title: "Your organization",
        blurb: "The company or agency that needs the verification.",
      },
      {
        key: "subject",
        title: "Employee to verify",
        blurb: "The former employee this verification is about.",
      },
      {
        key: "certificate",
        title: "Certificate",
        blurb: "What to issue, how to send it, and when you need it.",
      },
      { key: "review", title: "Review", blurb: "Read each line. Use Back if something is wrong." },
    ];
  }
  return [
    { key: "type", title: "Request type", blurb: "Who is asking HRDO for this certificate?" },
    { key: "you", title: "Your details", blurb: "Your name and how HRDO can reach you." },
    { key: "work", title: "Work details", blurb: "Your office and employment status." },
    {
      key: "certificate",
      title: "Certificate",
      blurb: "What to issue, how to send it, and when you need it.",
    },
    { key: "review", title: "Review", blurb: "Read each line. Use Back if something is wrong." },
  ];
}

export function coeCorrectionBatches(isThirdParty: boolean): CoeFormBatch[] {
  return isThirdParty
    ? coeRequestBatches("third_party").filter((batch) => batch.key !== "type")
    : coeRequestBatches("internal").filter((batch) => batch.key !== "type");
}

export function parseStoredDescription(raw: string) {
  const options: string[] = [];
  const details: Record<string, string> = {};
  let custom = "";
  if (!raw || /^not provided$/i.test(raw.trim())) {
    return { options, details, custom };
  }

  const parts = raw
    .split(", ")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const [index, part] of parts.entries()) {
    const option = [...COE_DESCRIPTION_OPTIONS]
      .sort((a, b) => b.length - a.length)
      .find(
        (item) => part === item || part.startsWith(`${item} `) || part.startsWith(`${item} - `),
      );
    if (!option) continue;
    if (!options.includes(option)) options.push(option);
    const remainder = part.slice(option.length).trim().replace(/^-\s*/, "");
    if (option === COE_DESCRIPTION_OTHER) {
      if (index === parts.length - 1 && remainder.includes(" - ")) {
        const split = remainder.split(" - ");
        custom = split[split.length - 1]?.trim() || remainder;
      } else {
        custom = remainder;
      }
    } else if (remainder) {
      details[option] = remainder;
    }
  }

  const tail = raw.match(/\s-\s([^-]+)$/);
  if (options.includes(COE_DESCRIPTION_OTHER) && tail?.[1] && !custom) {
    custom = tail[1].trim();
  }
  return { options, details, custom };
}

export function formatStoredDescription(
  options: string[],
  details: Record<string, string>,
  custom: string,
) {
  const listed =
    options
      .map((option) => `${option}${details[option]?.trim() ? ` ${details[option].trim()}` : ""}`)
      .join(", ") || "Not provided";
  const extra = custom.trim();
  return extra ? `${listed} - ${extra}` : listed;
}

export function departmentSelectValue(department: string) {
  if (!department.trim()) return "";
  return (COE_DEPARTMENTS as readonly string[]).includes(department) ? department : "Other";
}
