import { z } from "zod";
import { institutionalEmailAllowed } from "./validation";

const signatureImage = z
  .string()
  .min(100, "An electronic signature is required.")
  .max(2_000_000, "The signature image is too large.")
  .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, "The signature image is not valid.");

const receiptImage = z
  .string()
  .max(4_000_000, "The permission slip file is too large.")
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "The permission slip file is not valid.")
  .optional();

export const createPermissionSchema = z.object({
  department: z
    .string()
    .trim()
    .min(2, "Enter your department or office.")
    .max(190, "The department or office name is too long."),
  requestedDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Choose a valid date."),
  timeOut: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid time out."),
  timeIn: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid time in."),
  reason: z.string().trim().min(5, "State the reason for going out.").max(500),
  employeeSignature: signatureImage,
});

export const approvePermissionSchema = z.object({
  id: z.string().uuid("Invalid permission slip reference."),
  signature: signatureImage,
  receiptImage,
  sendEmail: z.boolean().default(true),
});

export const rejectPermissionSchema = z.object({
  id: z.string().uuid("Invalid permission slip reference."),
  reason: z.string().trim().min(5, "Please provide a reason for rejection.").max(500),
});

export const sendPermissionReceiptSchema = z.object({
  id: z.string().uuid("Invalid permission slip reference."),
  receiptImage: z
    .string()
    .max(4_000_000, "The permission slip file is too large.")
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "The permission slip file is not valid."),
});

export const permissionIdSchema = z.string().uuid("Invalid permission slip reference.");

export const createPermissionSignatorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter the signatory's full name.")
    .max(120, "Names must be 120 characters or fewer.")
    .regex(/^[\p{L}\p{M}.'\-\s]+$/u, "Use letters, spaces, periods, apostrophes or hyphens only."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid institutional email.")
    .max(190)
    .refine(institutionalEmailAllowed, "Use your @lyceumalabang.edu.ph address."),
  department: z
    .string()
    .trim()
    .min(2, "Enter the signatory's department or office.")
    .max(190, "Department must be 190 characters or fewer."),
});

export const permissionSignatoryIdSchema = z
  .string()
  .uuid("Invalid Permission Slip signatory reference.");
