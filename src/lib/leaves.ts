import { z } from "zod";
import { signatureSchema } from "./validation";
import type { Role } from "./types";

export const LEAVE_TYPES = {
  V: "Vacation Leave",
  S: "Sick Leave",
  B: "Birthday Leave",
  E: "Emergency Leave",
  M: "Maternity Leave",
  P: "Paternity Leave",
  SP: "Solo Parent Leave",
  SIL: "Service Incentive Leave",
} as const;
export const leaveDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid date.");
export function leaveRequiresPresident(role: Role) {
  return ["department_head", "transport_head", "director"].includes(role);
}
export const createLeaveSchema = z
  .object({
    id: z.string().uuid(),
    code: z.enum(["V", "S", "B", "E", "M", "P", "SP", "SIL"]),
    reason: z.string().trim().min(3).max(2000),
    dates: z
      .array(leaveDate)
      .min(1)
      .max(366)
      .refine((dates) => new Set(dates).size === dates.length, "Duplicate leave dates."),
    signature: signatureSchema,
    medicalCertificate: z
      .string()
      .max(4_000_000)
      .regex(/^data:(application\/pdf|image\/(png|jpeg));base64,[A-Za-z0-9+/=]+$/)
      .optional(),
  })
  .strict()
  .refine(
    (data) => data.code !== "S" || data.dates.length < 2 || Boolean(data.medicalCertificate),
    "Attach a medical certificate for two or more sick-leave days.",
  );
export const decideLeaveSchema = z
  .object({
    id: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
    signature: signatureSchema,
    note: z.string().trim().max(2000),
    credited: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => data.decision !== "reject" || data.note.length >= 3,
    "Enter a reason for rejection.",
  );
export type LeaveStatus = "pending_recommendation" | "pending_hr" | "approved" | "rejected";
export const LEAVE_STATUS: Record<LeaveStatus, string> = {
  pending_recommendation: "Awaiting recommending approval",
  pending_hr: "Awaiting HR review",
  approved: "Approved",
  rejected: "Rejected",
};
export interface LeaveRequest {
  id: string;
  employee_id: string;
  employee_name: string;
  department: string;
  code: keyof typeof LEAVE_TYPES;
  reason: string;
  dates: string[];
  employee_signature: string;
  medical_certificate: string | null;
  recommender_id: string;
  recommender_name: string;
  president_required: number;
  recommender_signature: string | null;
  recommended_at: string | null;
  hr_name: string | null;
  hr_signature: string | null;
  decided_at: string | null;
  status: LeaveStatus;
  note: string;
  /** 1 = deducted from paid balances; 0 = approved without a paid deduction; null = undecided or rejected. */
  credited: number | null;
  created_at: string;
  sync_status: "pending" | "synced" | "error" | "not_required";
  sync_error: string | null;
  balances: { usedSl: number; usedVl: number; remainingSl: number; remainingVl: number } | null;
}
