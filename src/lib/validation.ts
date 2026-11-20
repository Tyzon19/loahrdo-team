import { z } from "zod";

const email = z.string().trim().toLowerCase().min(3).max(190).email("Enter a valid email address.");

export const INSTITUTIONAL_EMAIL_DOMAIN = "lyceumalabang.edu.ph";

export function normalizePhilippineMobileNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^\+?[0-9().\-\s]+$/.test(trimmed)) return null;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("09")) return digits;
  if (digits.length === 10 && digits.startsWith("9")) return `0${digits}`;
  if (digits.length === 12 && digits.startsWith("639")) return `+${digits}`;
  return null;
}

const personName = z
  .string()
  .trim()
  .min(2, "Enter your full name.")
  .max(120, "Names must be 120 characters or fewer.")
  .regex(/^[\p{L}\p{M}.'\-\s]+$/u, "Use letters, spaces, periods, apostrophes or hyphens only.");

const department = z
  .string()
  .trim()
  .min(2, "Enter your department or office.")
  .max(190, "Department must be 190 characters or fewer.");

const hasControlChars = (value: string) =>
  Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });

export function passwordIssues(value: string): string[] {
  const issues: string[] = [];
  if (value.length < 12) issues.push("at least 12 characters");
  if (value.length > 128) issues.push("at most 128 characters");
  if (!/[a-z]/.test(value)) issues.push("a lower-case letter");
  if (!/[A-Z]/.test(value)) issues.push("an upper-case letter");
  if (!/[0-9]/.test(value)) issues.push("a number");
  if (!/[^A-Za-z0-9]/.test(value)) issues.push("a symbol");
  return issues;
}

export const password = z
  .string()
  .max(128)
  .superRefine((value, ctx) => {
    const issues = passwordIssues(value);
    if (issues.length) {
      ctx.addIssue({
        code: "custom",
        message: `Password must contain ${issues.join(", ")}.`,
      });
    }
  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(200),
});

export const registerSchema = z.object({
  name: personName,
  email,
  password,
});

const namePart = (label: string, required: boolean) => {
  const schema = z
    .string()
    .trim()
    .max(60, `${label} must be 60 characters or fewer.`)
    .regex(/^[\p{L}\p{M}.'\-\s]*$/u, "Use letters, spaces, periods, apostrophes or hyphens only.");
  return required ? schema.min(1, `Enter your ${label.toLowerCase()}.`) : schema;
};

/** Split name fields used when a Google account completes its profile. */
export const namePartsSchema = z.object({
  firstName: namePart("First name", true),
  middleName: namePart("Middle name", false),
  lastName: namePart("Last name", true),
});

export const registrationOtpSchema = z.object({
  email: email.refine(institutionalEmailAllowed, "Use your @lyceumalabang.edu.ph address."),
  code: z.string().regex(/^\d{6}$/, "Enter the six-digit verification code."),
});

export const passwordRecoveryRequestSchema = z.object({ email });

export const passwordRecoverySchema = z.object({
  email,
  code: z.string().regex(/^\d{6}$/, "Enter the six-digit recovery code."),
  newPassword: password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(200),
  newPassword: password,
});

export const profileSchema = z.object({
  name: personName,
  department,
});

const dateValue = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Choose a valid date.");

const destination = z
  .string()
  .trim()
  .min(2, "Enter a destination.")
  .max(200, "Destinations must be 200 characters or fewer.")
  .refine((v) => !hasControlChars(v), "Destinations contain invalid characters.");

export const requestInputSchema = z
  .object({
    department,
    destinations: z
      .array(destination)
      .min(1, "Enter your destinations.")
      .max(10, "You can add up to 10 destinations."),
    passengers: z
      .number({ error: "Enter the number of passengers." })
      .int("Enter a whole number of passengers.")
      .min(1, "Enter at least one passenger.")
      .max(60, "For more than 60 passengers, please file separate requests."),
    dateStart: dateValue,
    dateEnd: dateValue,
    timeNeeded: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose the time the vehicle is needed."),
    purpose: z
      .string()
      .trim()
      .min(5, "Describe the purpose of travel (at least 5 characters).")
      .max(1000, "Purpose must be 1,000 characters or fewer.")
      .refine((v) => !hasControlChars(v), "Purpose contains invalid characters."),
  })
  .refine((v) => v.dateEnd >= v.dateStart, {
    path: ["dateEnd"],
    message: "The end date must be on or after the start date.",
  });

export const destinationSearchSchema = z
  .string()
  .trim()
  .min(3, "Enter at least 3 characters to search previous destinations.")
  .max(100, "Search text must be 100 characters or fewer.");

export const requestIdSchema = z.string().uuid("Invalid request reference.");

export const signatureSchema = z.object({
  image: z
    .string()
    .min(50, "A signature is required.")
    .max(2_000_000, "The signature image is too large.")
    .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, "The signature image is not valid."),
  method: z.enum(["drawn", "uploaded"]),
});

export const approveSchema = z.object({
  id: requestIdSchema,
  signature: signatureSchema,
  proxySigner: z.boolean().default(false),
  driverName: z.string().trim().max(120).optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  vehicleType: z.string().trim().max(80).optional(),
  plateNo: z.string().trim().max(32).optional(),
  remarks: z.string().trim().max(1000).optional(),
});

export const sendTripTicketSchema = z.object({
  id: requestIdSchema,
  image: z
    .string()
    .min(100, "The trip ticket photo is missing.")
    .max(6_000_000, "The trip ticket photo is too large.")
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "The trip ticket photo is not valid."),
});

export const rejectSchema = z.object({
  id: requestIdSchema,
  reason: z
    .string()
    .trim()
    .min(5, "Please give a reason (at least 5 characters).")
    .max(1000, "The reason must be 1,000 characters or fewer."),
});

export const resubmitSchema = z.object({
  id: requestIdSchema,
  input: requestInputSchema,
});

export const updatePendingRequestSchema = z.object({
  id: requestIdSchema,
  input: requestInputSchema,
});

export const vehicleSchema = z.object({
  driverName: z.string().trim().min(2, "Enter the driver's name.").max(120),
  type: z.string().trim().min(2, "Enter the vehicle type.").max(80),
  plateNo: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Enter the plate number.")
    .max(32)
    .regex(/^[A-Z0-9 -]+$/, "Plate numbers may use letters, digits, spaces and hyphens only."),
});

export const deleteVehicleSchema = z.object({
  id: requestIdSchema,
});

export const updateVehicleSchema = vehicleSchema.extend({
  id: requestIdSchema,
});

export const signatoryAssistantsSchema = z.object({
  review: z.object({
    name: z.string().trim().max(120, "Names must be 120 characters or fewer."),
    userId: z.string().uuid().nullable(),
  }),
  recommend: z.object({
    name: z.string().trim().max(120, "Names must be 120 characters or fewer."),
    userId: z.string().uuid().nullable(),
  }),
  approve: z.object({
    name: z.string().trim().max(120, "Names must be 120 characters or fewer."),
    userId: z.string().uuid().nullable(),
  }),
});

export const mainSignatoriesSchema = z.object({
  review: z.string().uuid().nullable(),
  recommend: z.string().uuid().nullable(),
  approve: z.string().uuid().nullable(),
});

export const createMainSignatoryAccountSchema = z.object({
  stage: z.enum(["review", "recommend", "approve"]),
  name: personName,
  email,
  department,
});

export const createAssistantAccountSchema = z.object({
  name: personName,
  email,
  department,
});

export const createHrdoProcessorAccountSchema = z.object({
  name: personName,
  email: email.refine(institutionalEmailAllowed, "Use your @lyceumalabang.edu.ph address."),
  department,
  isHrdoAdmin: z.boolean().default(false),
});

export const resetUserPasswordSchema = z.object({
  userId: z.string().uuid(),
});

export const attendanceGroupSchema = z.object({
  staffGroup: z.enum(["NON_TEACHING", "COLLEGE", "BASIC_ED"]).optional(),
});

export const attendanceSyncSchema = z.object({
  staffGroup: z.enum(["NON_TEACHING", "COLLEGE", "BASIC_ED"]),
});

export const attendanceMappingSchema = z.object({
  userId: z.string().uuid(),
  staffGroup: z.enum(["NON_TEACHING", "COLLEGE", "BASIC_ED"]),
  sheetEmployeeName: z.string().trim().min(2).max(190),
});

export const attendanceFlagSchema = z.object({
  attendanceLogId: z.string().uuid().optional(),
  flagId: z.string().uuid().optional(),
  message: z.string().trim().min(3).max(1000),
});

export const signatoryPhoneSchema = z.object({
  userId: z.string().uuid(),
  phoneNumber: z
    .string()
    .trim()
    .max(32, "Phone numbers must be 32 characters or fewer.")
    .regex(/^[0-9+().\-\s]*$/, "Enter a valid telephone or mobile number.")
    .nullable(),
});

export const requestFilterSchema = z.object({
  status: z
    .enum([
      "all",
      "pending_review",
      "pending_recommendation",
      "pending_approval",
      "returned",
      "approved",
      "dispatched",
      "completed",
    ])
    .default("all"),
  q: z.string().trim().max(100).default(""),
});

const optionalDateFilter = dateValue.optional().or(z.literal(""));

export const tripArchiveFilterSchema = z
  .object({
    q: z.string().trim().max(100).default(""),
    from: optionalDateFilter,
    to: optionalDateFilter,
    page: z.number().int().min(0).max(10000).default(0),
  })
  .refine((filter) => !filter.from || !filter.to || filter.from <= filter.to, {
    path: ["to"],
    message: "The end date must be on or after the start date.",
  });

export const analyticsPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^\/[A-Za-z0-9\-._~/[:\]]*$/, "Invalid analytics path.");

export const notificationIdSchema = z.string().uuid("Invalid notification reference.");

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function normaliseEmail(value: string) {
  return value.trim().toLowerCase();
}

export function emailDomainAllowed(address: string, allowed: string[]) {
  const domain = normaliseEmail(address).split("@")[1] ?? "";
  return allowed.some((d) => d.trim().toLowerCase() === domain);
}

export function institutionalEmailAllowed(address: string) {
  return emailDomainAllowed(address, [INSTITUTIONAL_EMAIL_DOMAIN]);
}
